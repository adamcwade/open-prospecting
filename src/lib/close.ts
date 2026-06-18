import { db } from "@/db";
import { prospects, researchTasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "./config";
import { sendSms } from "./twilio";

/**
 * After a prospect agrees on a call, text them a recap of the tasks Modus will
 * handle plus a link to sign up on the website. Marks the prospect `agreed`
 * (a "sale" in the outreach dashboard). The actual subscription happens on the
 * client-facing site.
 */
export async function sendSignupMessage(
  prospectId: number
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [p] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);
  if (!p) return { ok: false, reason: "not_found" };
  if (!p.phone) return { ok: false, reason: "no_phone" };

  const tasks = await db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.prospectId, prospectId))
    .orderBy(researchTasks.position);

  const taskLines = tasks
    .slice(0, 5)
    .map((t, i) => `${i + 1}. ${t.title}`)
    .join("\n");

  const body =
    `Thanks for chatting with Modus, ${p.businessName}.\n\n` +
    `Here are 5 tasks your AI agent can start with:\n${taskLines}\n\n` +
    `Sign up to get started: ${config.signupUrl}`;

  try {
    await sendSms({ to: p.phone, body });
  } catch (err) {
    return { ok: false, reason: `sms_error: ${(err as Error).message}` };
  }

  await db
    .update(prospects)
    .set({ status: "agreed", updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));

  return { ok: true };
}
