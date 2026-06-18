import { db } from "@/db";
import { phoneNumbers } from "@/db/schema";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";

/**
 * Pick an outbound number from the shared prospecting pool, preferring the
 * least-recently-used number that is not currently resting. Updates lastUsedAt.
 *
 * Returns null if the pool is empty / all numbers are resting.
 */
export async function pickOutboundNumber(): Promise<string | null> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(phoneNumbers)
    .where(
      and(
        eq(phoneNumbers.state, "pool"),
        or(isNull(phoneNumbers.restUntil), lte(phoneNumbers.restUntil, now))
      )
    )
    .orderBy(asc(phoneNumbers.lastUsedAt))
    .limit(1);

  const chosen = candidates[0];
  if (!chosen) return null;

  await db
    .update(phoneNumbers)
    .set({ lastUsedAt: now })
    .where(eq(phoneNumbers.id, chosen.id));

  return chosen.e164;
}

/**
 * Assign a dedicated number to a paying client (phase 2). Pulls an unassigned
 * pool number and marks it assigned. In production this would also provision a
 * fresh Twilio number rather than reusing a pool number.
 */
export async function assignNumberToClient(
  clientId: number
): Promise<string | null> {
  const available = await db
    .select()
    .from(phoneNumbers)
    .where(and(eq(phoneNumbers.state, "pool"), isNull(phoneNumbers.assignedClientId)))
    .limit(1);

  const chosen = available[0];
  if (!chosen) return null;

  await db
    .update(phoneNumbers)
    .set({ state: "assigned", assignedClientId: clientId })
    .where(eq(phoneNumbers.id, chosen.id));

  return chosen.e164;
}
