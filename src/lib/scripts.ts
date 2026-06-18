import { db } from "@/db";
import { prospects, researchTasks, scripts, strategies } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { generateJson } from "./anthropic";

/** Most value tasks the agent pitches on a call — kept tight so the call stays short. */
const MAX_PITCH_TASKS = 3;

type Prospect = typeof prospects.$inferSelect;
type Task = typeof researchTasks.$inferSelect;
type Strategy = typeof strategies.$inferSelect;

/** Returns the currently active strategy, or null if none set yet. */
export async function activeStrategy() {
  const [s] = await db
    .select()
    .from(strategies)
    .where(eq(strategies.isActive, true))
    .orderBy(desc(strategies.version))
    .limit(1);
  return s ?? null;
}

/**
 * Build a concise, high-converting voice + SMS sales script for a prospect from
 * its top value tasks and the active strategy.
 *
 * Structure follows proven cold-call practice: a permission-based opener, a
 * money-framed value hook (outcomes, not features), one qualifying question, and
 * a clear close — plus built-in objection handling (acknowledge → reframe →
 * re-ask), interruption handling, and graceful rejection. The agent sounds like
 * a human rep: no "I'm an AI" and no "this call is recorded" disclosure.
 *
 * Pure: returns the scripts, persists nothing.
 */
async function buildScripts(
  p: Prospect,
  tasks: Task[],
  strategy: Strategy | null
): Promise<{ voiceScript: string; smsScript: string }> {
  const pitch = tasks.slice(0, MAX_PITCH_TASKS);
  return generateJson<{ voiceScript: string; smsScript: string }>({
    maxTokens: 1500,
    system:
      "You write SHORT, natural, high-converting outbound sales scripts for Modus, an AI agent that " +
      "local businesses subscribe to for $35/month, no contract. The agent phones the owner/manager to " +
      "win the subscription. It must sound like a warm, confident HUMAN rep — NEVER say it is an AI and " +
      "NEVER say the call is recorded.\n\n" +
      "Write the VOICE script on this proven cold-call structure. The whole call should run ~60-90 " +
      "seconds; keep every line short and speakable:\n" +
      "OPENER: warm, permission-based — greet by name, a quick human pattern-interrupt, ask for ~20 seconds.\n" +
      "VALUE: 2 sentences max. Lead with the single biggest money outcome from the tasks below (more " +
      "booked jobs, recovered leads, fewer no-shows). Outcomes and dollars, not features.\n" +
      "QUALIFY: one short question that surfaces the pain (e.g. how they handle missed calls / follow-ups today).\n" +
      "CLOSE: ask for the yes plainly — $35/month, no contract, live today — then ask for the best email.\n" +
      "OBJECTIONS: for each of 'not interested', 'bad time / busy', 'send me an email', 'too expensive', and " +
      "'we already do this / have someone', give a 1-2 line reply that acknowledges, reframes to value, and " +
      "re-asks. Treat objections as buying signals — never argue or get pushy.\n" +
      "IF INTERRUPTED / NO: if interrupted, stop and listen, acknowledge, answer in one breath, then bridge " +
      "back. If it is a firm no or they say stop, thank them warmly and end the call.\n\n" +
      "Reference the business name and industry. Then write an SMS script: 1-2 sentences, one concrete money " +
      "outcome plus a clear call to action to sign up, under 320 characters, no AI/recorded mention.\n" +
      'Respond as JSON: {"voiceScript":"...","smsScript":"..."}. In voiceScript use these section labels — ' +
      "OPENER:, VALUE:, QUALIFY:, CLOSE:, OBJECTIONS:, IF INTERRUPTED / NO: — each on its own line.",
    prompt: [
      `Business: ${p.businessName}`,
      `Industry: ${p.industry ?? "unknown"}`,
      `Highest-impact tasks Modus can do for them (lead with #1):`,
      ...pitch.map((t) => `- [${t.impact}] ${t.title}: ${t.description}`),
      strategy
        ? `\nActive strategy — pitch angle: ${strategy.pitchAngle}\nObjection handling: ${strategy.objectionHandling}`
        : "",
    ].join("\n"),
  });
}

/**
 * Generate voice + SMS scripts for a prospect and persist them, advancing the
 * prospect to `scripted`. Used by the pipeline the first time a prospect is
 * scripted.
 */
export async function generateScripts(prospectId: number): Promise<void> {
  const [p] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);
  if (!p) throw new Error(`Prospect ${prospectId} not found`);

  const tasks = await db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.prospectId, prospectId))
    .orderBy(researchTasks.position);

  const strategy = await activeStrategy();
  const { voiceScript, smsScript } = await buildScripts(p, tasks, strategy);

  await db.insert(scripts).values({
    prospectId,
    strategyId: strategy?.id ?? null,
    voiceScript,
    smsScript,
  });

  await db
    .update(prospects)
    .set({ status: "scripted", updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));
}

/**
 * Re-generate a prospect's latest script in the current format, updating it in
 * place WITHOUT changing the prospect's pipeline status. Returns false if the
 * prospect has no script yet (we only reformat prospects that already have one).
 * Used to roll a script-format change across existing prospects.
 */
export async function regenerateScript(prospectId: number): Promise<boolean> {
  const [p] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);
  if (!p) return false;

  const [existing] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.prospectId, prospectId))
    .orderBy(desc(scripts.createdAt))
    .limit(1);
  if (!existing) return false;

  const tasks = await db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.prospectId, prospectId))
    .orderBy(researchTasks.position);

  const strategy = await activeStrategy();
  const { voiceScript, smsScript } = await buildScripts(p, tasks, strategy);

  await db
    .update(scripts)
    .set({
      voiceScript,
      smsScript,
      strategyId: strategy?.id ?? existing.strategyId,
    })
    .where(eq(scripts.id, existing.id));
  return true;
}
