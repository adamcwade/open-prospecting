import { db } from "@/db";
import { discoveryRuns, prospects } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { config } from "./config";
import { normalizePhone } from "./compliance";

export interface CandidateBusiness {
  businessName: string;
  industry?: string;
  phone?: string;
  email?: string;
  websiteUrl?: string;
  source?: string;
}

/** UTC YYYY-MM-DD key for the current discovery window. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** How many prospects have been added in today's window. */
export async function addedToday(): Promise<number> {
  const key = todayKey();
  const rows = await db
    .select({ added: discoveryRuns.addedCount })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.runDate, key))
    .limit(1);
  return rows[0]?.added ?? 0;
}

/** Remaining slots before the daily cap is hit. */
export async function remainingToday(): Promise<number> {
  return Math.max(0, config.discoveryDailyCap - (await addedToday()));
}

async function bumpCounter(by: number): Promise<void> {
  const key = todayKey();
  await db
    .insert(discoveryRuns)
    .values({ runDate: key, addedCount: by })
    .onConflictDoUpdate({
      target: discoveryRuns.runDate,
      set: { addedCount: sql`${discoveryRuns.addedCount} + ${by}` },
    });
}

/**
 * Persist candidate businesses with dedup (by phone + domain) and enforce the
 * hard daily cap. Returns the number actually inserted.
 *
 * Candidates missing both phone and website are skipped; a record present but
 * missing one is stored as `incomplete` and not queued for calling.
 */
export async function ingestCandidates(
  candidates: CandidateBusiness[]
): Promise<{ inserted: number; remaining: number }> {
  let remaining = await remainingToday();
  let inserted = 0;

  for (const c of candidates) {
    if (remaining <= 0) break;
    if (!c.phone && !c.websiteUrl) continue; // unusable

    const phone = c.phone ? normalizePhone(c.phone) : null;
    const status = phone && c.websiteUrl ? "new" : "incomplete";

    const res = await db
      .insert(prospects)
      .values({
        businessName: c.businessName,
        industry: c.industry ?? null,
        phone,
        email: c.email ?? null,
        websiteUrl: c.websiteUrl ?? null,
        source: c.source ?? "web_search",
        status,
      })
      // Dedup: unique indexes on phone and website_url cause conflicts to no-op.
      .onConflictDoNothing()
      .returning({ id: prospects.id });

    if (res.length > 0) {
      inserted += 1;
      remaining -= 1;
    }
  }

  if (inserted > 0) await bumpCounter(inserted);
  return { inserted, remaining };
}
