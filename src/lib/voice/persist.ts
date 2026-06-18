import { db } from "@/db";
import { contactAttempts, prospects, transcripts } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { CallResult } from "./realtime-bridge";
import { generateJson } from "../anthropic";
import { config } from "../config";
import { optOut } from "../compliance";
import { sendSignupMessage } from "../close";
import { onboardAgreedProspect } from "../onboard-client";
import { captureCallEmail } from "./capture-email";
import { maybeReviewStrategy } from "../strategy";

/** Summarize a transcript into one or two sentences. Best-effort. */
async function summarize(result: CallResult): Promise<string | null> {
  if (!result.turns.length || !config.anthropic.apiKey) return null;
  try {
    const { summary } = await generateJson<{ summary: string }>({
      system:
        "Summarize this sales call transcript in 1-2 sentences: the outcome and any key " +
        'detail. Respond as JSON: {"summary":"..."}.',
      prompt: result.turns.map((t) => `${t.role}: ${t.text}`).join("\n"),
      maxTokens: 200,
    });
    return summary;
  } catch {
    return null;
  }
}

/**
 * Persist a completed prospecting call: update the attempt outcome, store the
 * transcript, handle opt-out / signup, then run the self-review trigger.
 */
export async function persistCallResult(result: CallResult): Promise<void> {
  if (result.params.mode !== "prospect" || !result.params.prospectId) return;
  const prospectId = Number(result.params.prospectId);

  const [attempt] = await db
    .select()
    .from(contactAttempts)
    .where(
      and(
        eq(contactAttempts.prospectId, prospectId),
        eq(contactAttempts.channel, "voice"),
        isNull(contactAttempts.endedAt)
      )
    )
    .orderBy(desc(contactAttempts.startedAt))
    .limit(1);

  const outcome = result.stopRequested
    ? "opted_out"
    : result.agreed
    ? "agreed"
    : result.turns.length > 1
    ? "connected"
    : "no_answer";

  const summary = await summarize(result);

  let attemptId = attempt?.id;
  if (attempt) {
    await db
      .update(contactAttempts)
      .set({ outcome, endedAt: new Date(), disclosurePlayed: result.turns.length > 0 })
      .where(eq(contactAttempts.id, attempt.id));
  } else {
    const [created] = await db
      .insert(contactAttempts)
      .values({
        prospectId,
        channel: "voice",
        outcome,
        endedAt: new Date(),
        disclosurePlayed: result.turns.length > 0,
      })
      .returning({ id: contactAttempts.id });
    attemptId = created.id;
  }

  if (attemptId) {
    await db.insert(transcripts).values({ attemptId, turns: result.turns, summary });
  }

  if (result.stopRequested) {
    const [p] = await db
      .select({ phone: prospects.phone })
      .from(prospects)
      .where(eq(prospects.id, prospectId))
      .limit(1);
    if (p?.phone) await optOut(p.phone, "verbal");
  } else if (result.agreed) {
    // Capture any email the prospect gave on the call and persist it before the
    // handoff, so onboarding sends their real address instead of a placeholder.
    await captureCallEmail(prospectId, result.turns).catch((e) => {
      console.error("[voice] email capture error", e);
      return null;
    });
    const onboarded = await onboardAgreedProspect(prospectId).catch((e) => {
      console.error("[voice] onboard error", e);
      return false;
    });
    if (!onboarded) await sendSignupMessage(prospectId);
  }

  await maybeReviewStrategy().catch((e) => console.error("[voice] review error", e));
}
