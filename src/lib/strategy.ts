import { db } from "@/db";
import {
  contactAttempts,
  prospects,
  strategies,
  transcripts,
} from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { generateJson } from "./anthropic";
import { config } from "./config";

/** Count of completed (connected/declined/agreed) call attempts. */
export async function completedCallCount(): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(contactAttempts)
    .where(eq(contactAttempts.channel, "voice"));
  return row?.c ?? 0;
}

/**
 * Self-review: after every Nth completed call, review recent transcripts and
 * outcomes, then write a new active strategy version with a rationale. Previous
 * strategies are deactivated but retained for history/revert.
 *
 * Returns the new strategy version, or null if it is not time to review yet.
 */
export async function maybeReviewStrategy(): Promise<number | null> {
  const calls = await completedCallCount();
  if (calls === 0 || calls % config.selfReviewEveryCalls !== 0) return null;

  // Gather the most recent transcripts + outcomes for context.
  const recent = await db
    .select({
      outcome: contactAttempts.outcome,
      summary: transcripts.summary,
    })
    .from(contactAttempts)
    .leftJoin(transcripts, eq(transcripts.attemptId, contactAttempts.id))
    .where(eq(contactAttempts.channel, "voice"))
    .orderBy(desc(contactAttempts.startedAt))
    .limit(config.selfReviewEveryCalls);

  const [current] = await db
    .select()
    .from(strategies)
    .where(eq(strategies.isActive, true))
    .orderBy(desc(strategies.version))
    .limit(1);

  const next = await generateJson<{
    pitchAngle: string;
    objectionHandling: string;
    targetVerticalMix: Record<string, number>;
    rationale: string;
  }>({
    system:
      "You are the strategy brain for Modus's outbound sales agent. Review recent call outcomes " +
      "and decide whether to adjust the pitch angle, objection handling, or vertical focus to " +
      "improve the conversion rate toward the $35/month subscription. Keep changes incremental and " +
      'grounded in the data. Respond as JSON: {"pitchAngle":"...","objectionHandling":"...",' +
      '"targetVerticalMix":{"dental":0.3,...},"rationale":"what changed and why"}.',
    prompt: [
      current
        ? `Current strategy:\n- pitch: ${current.pitchAngle}\n- objections: ${current.objectionHandling}`
        : "No prior strategy.",
      `\nLast ${recent.length} call outcomes:`,
      ...recent.map(
        (r, i) => `${i + 1}. outcome=${r.outcome ?? "n/a"} summary=${r.summary ?? "n/a"}`
      ),
    ].join("\n"),
  });

  const nextVersion = (current?.version ?? 0) + 1;

  await db.update(strategies).set({ isActive: false }).where(eq(strategies.isActive, true));

  const [created] = await db
    .insert(strategies)
    .values({
      version: nextVersion,
      pitchAngle: next.pitchAngle,
      objectionHandling: next.objectionHandling,
      targetVerticalMix: next.targetVerticalMix,
      rationale: next.rationale,
      isActive: true,
      createdByCall: calls,
    })
    .returning({ version: strategies.version });

  return created?.version ?? null;
}

/** Operator action: revert to a prior strategy version. */
export async function revertStrategy(version: number): Promise<void> {
  await db.update(strategies).set({ isActive: false }).where(eq(strategies.isActive, true));
  await db.update(strategies).set({ isActive: true }).where(eq(strategies.version, version));
}

/** Mark a prospect agreed (used by the call/SMS close handlers). */
export async function markAgreed(prospectId: number): Promise<void> {
  await db
    .update(prospects)
    .set({ status: "agreed", updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));
}
