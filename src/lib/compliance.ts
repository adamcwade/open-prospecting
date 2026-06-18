import { db } from "@/db";
import { optOuts, prospects } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Normalize a phone number to a comparable E.164-ish form. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

/** Returns true if the number has opted out (on the DNC list). */
export async function isOptedOut(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const rows = await db
    .select({ id: optOuts.id })
    .from(optOuts)
    .where(eq(optOuts.phone, normalized))
    .limit(1);
  return rows.length > 0;
}

/** Detects a stop/opt-out intent in an inbound message or transcript line. */
export function isStopKeyword(text: string): boolean {
  return /\b(stop|unsubscribe|do not call|don'?t call|remove me|opt out)\b/i.test(
    text
  );
}

/**
 * Permanently opt a number out across voice and SMS. Idempotent.
 * Also flips any matching prospect to `opted_out`.
 */
export async function optOut(
  phone: string,
  reason: "stop_keyword" | "verbal" | "manual"
): Promise<void> {
  const normalized = normalizePhone(phone);
  await db
    .insert(optOuts)
    .values({ phone: normalized, reason })
    .onConflictDoNothing();
  await db
    .update(prospects)
    .set({ status: "opted_out", updatedAt: new Date() })
    .where(eq(prospects.phone, normalized));
}
