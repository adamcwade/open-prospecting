import { NextRequest } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contactAttempts, prospects, scripts } from "@/db/schema";
import { isOptedOut } from "@/lib/compliance";
import { isOutboundPaused } from "@/lib/settings";
import { sendSms } from "@/lib/twilio";

/**
 * Twilio call status callback. On no-answer/busy/failed we mark the attempt and
 * fall back to sending the prospect's SMS pitch (subject to DNC + kill switch).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const callSid = String(form?.get("CallSid") ?? "");
  const status = String(form?.get("CallStatus") ?? "");
  if (!callSid) return new Response("ok");

  const [attempt] = await db
    .select()
    .from(contactAttempts)
    .where(eq(contactAttempts.twilioSid, callSid))
    .limit(1);
  if (!attempt) return new Response("ok");

  const unanswered = ["no-answer", "busy", "failed"].includes(status);
  if (!unanswered) return new Response("ok");

  // Only update if the bridge has not already closed out the attempt.
  await db
    .update(contactAttempts)
    .set({
      outcome: status === "no-answer" ? "no_answer" : "failed",
      endedAt: new Date(),
    })
    .where(and(eq(contactAttempts.id, attempt.id), isNull(contactAttempts.outcome)));

  // SMS fallback.
  if (attempt.prospectId && attempt.toNumber) {
    if (await isOutboundPaused()) return new Response("ok");
    if (await isOptedOut(attempt.toNumber)) return new Response("ok");

    const [script] = await db
      .select({ smsScript: scripts.smsScript })
      .from(scripts)
      .where(eq(scripts.prospectId, attempt.prospectId))
      .orderBy(desc(scripts.createdAt))
      .limit(1);

    if (script?.smsScript) {
      try {
        await sendSms({ to: attempt.toNumber, body: script.smsScript });
        await db.insert(contactAttempts).values({
          prospectId: attempt.prospectId,
          channel: "sms",
          toNumber: attempt.toNumber,
          fromNumber: attempt.fromNumber,
          outcome: "connected",
          endedAt: new Date(),
        });
      } catch (err) {
        console.error("[status] sms fallback failed:", err);
      }
    }
  }

  return new Response("ok");
}
