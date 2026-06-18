import { db } from "@/db";
import { contactAttempts, prospects, scripts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { config } from "../config";
import { isOptedOut, optOut } from "../compliance";
import { isOutboundPaused } from "../settings";
import { pickOutboundNumber } from "../numbers";
import { placeCall } from "../twilio";

export type DialResult =
  | { ok: true; attemptId: number; callSid: string; from: string }
  | { ok: false; reason: string };

/**
 * Dial a single prospect. Enforces the kill switch and DNC before placing the
 * call, picks a rotating from-number, and records the attempt. The actual
 * conversation + transcript is handled by the media-stream server.
 */
export async function dialProspect(prospectId: number): Promise<DialResult> {
  if (await isOutboundPaused()) return { ok: false, reason: "outbound_paused" };

  const [p] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);
  if (!p) return { ok: false, reason: "not_found" };
  if (!p.phone) return { ok: false, reason: "no_phone" };

  if (await isOptedOut(p.phone)) {
    await db
      .update(prospects)
      .set({ status: "opted_out", updatedAt: new Date() })
      .where(eq(prospects.id, prospectId));
    return { ok: false, reason: "opted_out" };
  }

  // Require a generated script before calling.
  const [script] = await db
    .select({ id: scripts.id })
    .from(scripts)
    .where(eq(scripts.prospectId, prospectId))
    .orderBy(desc(scripts.createdAt))
    .limit(1);
  if (!script) return { ok: false, reason: "no_script" };

  const from = await pickOutboundNumber();
  if (!from) return { ok: false, reason: "no_pool_number" };

  const base = config.voice.publicUrl;
  const twimlUrl = `${base}/api/twilio/voice?mode=prospect&prospectId=${prospectId}`;
  const statusCallback = `${base}/api/twilio/status`;

  let callSid: string;
  try {
    const call = await placeCall({ to: p.phone, from, twimlUrl, statusCallback });
    callSid = call.sid;
  } catch (err) {
    return { ok: false, reason: `twilio_error: ${(err as Error).message}` };
  }

  const [attempt] = await db
    .insert(contactAttempts)
    .values({
      prospectId,
      channel: "voice",
      fromNumber: from,
      toNumber: p.phone,
      twilioSid: callSid,
    })
    .returning({ id: contactAttempts.id });

  await db
    .update(prospects)
    .set({ status: "contacted", updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));

  return { ok: true, attemptId: attempt.id, callSid, from };
}

/** Mark a number opted out from a verbal stop captured mid-call. */
export async function recordVerbalOptOut(phone: string): Promise<void> {
  await optOut(phone, "verbal");
}
