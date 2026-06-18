import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { config } from "@/lib/config";
import { researchProspect } from "@/lib/research";
import { generateScripts } from "@/lib/scripts";

/**
 * Advance prospects through the prep pipeline:
 *   new -> researched (3 tasks)  then  researched -> scripted (voice+sms).
 * Scripted prospects are then ready to dial. Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (config.cronSecret && auth !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = Number(req.nextUrl.searchParams.get("batch") ?? 10);

  const toResearch = await db
    .select({ id: prospects.id })
    .from(prospects)
    .where(eq(prospects.status, "new"))
    .limit(batch);

  let researched = 0;
  for (const p of toResearch) {
    try {
      await researchProspect(p.id);
      researched += 1;
    } catch (err) {
      console.error(`[pipeline] research ${p.id} failed:`, err);
    }
  }

  const toScript = await db
    .select({ id: prospects.id })
    .from(prospects)
    .where(eq(prospects.status, "researched"))
    .limit(batch);

  let scripted = 0;
  for (const p of toScript) {
    try {
      await generateScripts(p.id);
      scripted += 1;
    } catch (err) {
      console.error(`[pipeline] script ${p.id} failed:`, err);
    }
  }

  return NextResponse.json({ researched, scripted });
}
