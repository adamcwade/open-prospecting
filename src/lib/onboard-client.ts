import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prospects, researchTasks } from "@/db/schema";
import { config } from "./config";
import { sendSms } from "./twilio";

/**
 * After a prospect agrees: ask the customer app to onboard them (create the
 * account + run the 5 proof tasks) and text them a magic link to the finished
 * work. Returns false if the handoff could not be completed so the caller can
 * fall back to the generic signup message.
 */
export async function onboardAgreedProspect(prospectId: number): Promise<boolean> {
  if (!config.appOnboardUrl || !config.onboardSecret) return false;

  const [p] = await db.select().from(prospects).where(eq(prospects.id, prospectId)).limit(1);
  if (!p || !p.phone) return false;

  const tasks = await db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.prospectId, prospectId))
    .orderBy(researchTasks.position);

  let magicUrl: string;
  try {
    const res = await fetch(config.appOnboardUrl, {
      method: "POST",
      // The customer app waits up to 2 minutes for the proof tasks before
      // responding; allow margin beyond that so we don't fall back prematurely.
      signal: AbortSignal.timeout(150_000),
      headers: {
        "content-type": "application/json",
        "x-onboard-secret": config.onboardSecret,
      },
      body: JSON.stringify({
        prospectId: p.id,
        businessName: p.businessName,
        email: p.email ?? `prospect+${p.id}@modus.app`,
        websiteUrl: p.websiteUrl,
        phone: p.phone,
        tasks: tasks.slice(0, 5).map((t) => ({ title: t.title, description: t.description })),
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { magicUrl?: string };
    if (!data.magicUrl) return false;
    magicUrl = data.magicUrl;
  } catch {
    return false;
  }

  const body =
    `Done! Your Modus agent already finished ${tasks.slice(0, 5).length} tasks for ` +
    `${p.businessName}. See the results and keep it running here:\n${magicUrl}`;

  try {
    await sendSms({ to: p.phone, body });
  } catch {
    return false;
  }

  await db
    .update(prospects)
    .set({ status: "agreed", updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));

  return true;
}
