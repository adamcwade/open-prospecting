import { db } from "@/db";
import { prospects, researchTasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateJson } from "./anthropic";
import { extractContact, fetchHtml } from "./scrape";

type Impact = "revenue" | "cost" | "other";

interface TaskIdea {
  title: string;
  description: string;
  bullets: string[];
  impact: Impact;
}

/** Number of value tasks Modus determines before pitching / sending the link.
 *  Kept to 3 — the agent can only credibly pitch a few, and it cuts API cost. */
const TASK_COUNT = 3;

/** Max short bullets shown under each task on the prospect page. */
const MAX_BULLETS = 4;

/** Priority used to order tasks: revenue first, then cost savings, then the rest. */
const IMPACT_RANK: Record<Impact, number> = { revenue: 0, cost: 1, other: 2 };

function normalizeImpact(value: unknown): Impact {
  return value === "revenue" || value === "cost" ? value : "other";
}

/** Keep at most MAX_BULLETS trimmed, non-empty bullet strings. */
function normalizeBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((b) => String(b).trim())
    .filter(Boolean)
    .slice(0, MAX_BULLETS);
}

/** Sort revenue → cost → other, preserving the model's order within each group. */
function orderByImpact(tasks: TaskIdea[]): TaskIdea[] {
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => IMPACT_RANK[a.t.impact] - IMPACT_RANK[b.t.impact] || a.i - b.i)
    .map(({ t }) => t);
}

/** Default tasks used when a website is unreachable or analysis fails. Revenue/cost first. */
const DEFAULT_TASKS: TaskIdea[] = [
  { title: "Recover missed-call leads", description: "Instantly text back everyone who calls and doesn't get through, so the job books with you instead of a competitor.", bullets: ["Texts back every missed call", "Books the job before they move on", "Wins work that would go to rivals"], impact: "revenue" },
  { title: "Follow up every unconverted enquiry & quote", description: "Chase leads and quotes that went quiet until they book — recovering revenue that usually slips away.", bullets: ["Chases quiet leads and quotes", "Keeps following up until they book", "Recovers revenue that slips away"], impact: "revenue" },
  { title: "Fill open & cancelled appointment slots", description: "Offer gaps and last-minute cancellations to your waitlist to keep the calendar full.", bullets: ["Offers gaps to your waitlist", "Fills last-minute cancellations", "Keeps the calendar full"], impact: "revenue" },
  { title: "Automate booking, confirmations & reminders", description: "Cut no-shows and the hours spent on phone tag and manual scheduling.", bullets: ["Sends confirmations and reminders", "Cuts no-shows", "Ends manual phone tag"], impact: "cost" },
  { title: "Request & respond to reviews 24/7", description: "Ask happy customers for reviews and reply to all of them to build the reputation that drives inbound.", bullets: ["Asks happy clients for reviews", "Replies to every review", "Builds reputation that drives inbound"], impact: "other" },
];

/** Strip tags/whitespace from fetched HTML and cap length for LLM analysis. */
function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

/**
 * Analyze a prospect's website and determine exactly 5 specific tasks Modus can
 * complete for them. These are the value props pitched on the call and listed
 * with the signup/payment link. Falls back to defaults if the site is
 * unreachable. Persists the tasks and advances the prospect to `researched`.
 */
export async function researchProspect(prospectId: number): Promise<void> {
  const [p] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);
  if (!p) throw new Error(`Prospect ${prospectId} not found`);

  let tasks: TaskIdea[];
  let isDefault = false;

  // Fetch the homepage once: used both to propose tasks and to backfill a
  // contact email. Most prospects (Serper "places") arrive with no email, so
  // this is the cheapest place to capture one before the onboarding handoff.
  const html = p.websiteUrl ? await fetchHtml(p.websiteUrl) : null;
  const siteText = html ? cleanHtml(html) : null;
  const backfillEmail = html && !p.email ? extractContact(html).email : undefined;

  if (siteText) {
    try {
      const result = await generateJson<{ tasks: TaskIdea[] }>({
        maxTokens: 2048,
        system:
          "You are a revenue strategist for Modus, an AI agent that completes daily tasks for " +
          `local businesses. Analyze this business's website and propose exactly ${TASK_COUNT} ` +
          "specific, concrete tasks Modus could do for THIS business, tied to their actual services. " +
          "PRIORITIZE tasks that directly INCREASE REVENUE (win more bookings/jobs, raise conversion, " +
          "recover lost leads, upsell, reduce no-shows that cost sales) or REDUCE COSTS (cut admin " +
          "hours, automate manual work) FIRST; include lower-priority 'other' tasks only after those. " +
          'Classify each task\'s "impact" as "revenue", "cost", or "other", and order the array with ' +
          "revenue tasks first, then cost, then other. " +
          `For each task give a one-line "description" plus "bullets": ${MAX_BULLETS - 1}-${MAX_BULLETS} ` +
          "short, concrete points (max ~8 words each, no trailing punctuation) that read as a scannable list. " +
          `Respond as JSON: {"tasks":[{"title":"...","description":"...","bullets":["...","..."],` +
          `"impact":"revenue|cost|other"}]} with exactly ${TASK_COUNT} items.`,
        prompt: `Business: ${p.businessName}\nIndustry: ${p.industry ?? "unknown"}\nWebsite text:\n${siteText}`,
      });
      tasks = result.tasks
        .map((t) => ({
          title: t.title,
          description: t.description,
          bullets: normalizeBullets(t.bullets),
          impact: normalizeImpact(t.impact),
        }))
        .slice(0, TASK_COUNT);
      if (tasks.length === 0) {
        tasks = DEFAULT_TASKS;
        isDefault = true;
      }
    } catch (err) {
      console.error(`[research] LLM analysis failed for ${prospectId}, using defaults:`, err);
      tasks = DEFAULT_TASKS;
      isDefault = true;
    }
  } else {
    tasks = DEFAULT_TASKS;
    isDefault = true;
  }

  // Always store revenue → cost → other, capped at TASK_COUNT (the default-task
  // fallback list is longer, so the slice matters there too).
  const ordered = orderByImpact(tasks).slice(0, TASK_COUNT);

  await db.delete(researchTasks).where(eq(researchTasks.prospectId, prospectId));
  await db.insert(researchTasks).values(
    ordered.map((t, i) => ({
      prospectId,
      position: i + 1,
      title: t.title,
      description: t.description,
      bullets: t.bullets,
      impact: t.impact,
      isDefault,
    }))
  );

  await db
    .update(prospects)
    .set({
      status: "researched",
      ...(backfillEmail ? { email: backfillEmail } : {}),
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, prospectId));
}

/**
 * Derive short bullets from a set of existing tasks' titles + descriptions.
 * Used to backfill rows created before the `bullets` column existed, without
 * regenerating the tasks themselves (which would reset titles and status).
 * Returns one bullet array per input task, aligned by index.
 */
export async function generateBulletsForTasks(
  tasks: { title: string; description: string }[]
): Promise<string[][]> {
  if (tasks.length === 0) return [];
  const result = await generateJson<{ bullets: string[][] }>({
    maxTokens: 2048,
    system:
      "You rewrite sales task descriptions into short, scannable bullet points. For each task, " +
      `produce ${MAX_BULLETS - 1}-${MAX_BULLETS} concise bullets (max ~8 words each, no trailing ` +
      "punctuation) capturing the concrete value — do NOT change the meaning or invent new claims. " +
      'Respond as JSON: {"bullets":[["point","point"],...]} with one array per task, in the same order.',
    prompt: tasks
      .map((t, i) => `${i + 1}. ${t.title}: ${t.description}`)
      .join("\n"),
  });
  return tasks.map((_, i) => normalizeBullets(result.bullets?.[i]));
}
