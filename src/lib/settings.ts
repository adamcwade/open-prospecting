import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const KILL_SWITCH = "outbound_paused";

export async function isOutboundPaused(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, KILL_SWITCH))
    .limit(1);
  return Boolean(row?.value);
}

export async function setOutboundPaused(paused: boolean): Promise<void> {
  await db
    .insert(settings)
    .values({ key: KILL_SWITCH, value: paused })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: paused, updatedAt: new Date() },
    });
}
