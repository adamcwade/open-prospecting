import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { config } from "@/lib/config";
import { isOutboundPaused } from "@/lib/settings";
import { dialProspect } from "@/lib/voice/dialer";

/**
 * Dial a batch of scripted prospects. Honors the kill switch globally and
 * per-call DNC/state checks inside dialProspect. Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (config.cronSecret && auth !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await isOutboundPaused()) {
    return NextResponse.json({ dialed: 0, paused: true });
  }

  const batch = Number(req.nextUrl.searchParams.get("batch") ?? 5);
  const ready = await db
    .select({ id: prospects.id })
    .from(prospects)
    .where(eq(prospects.status, "scripted"))
    .limit(batch);

  const results = [];
  for (const p of ready) {
    results.push({ prospectId: p.id, ...(await dialProspect(p.id)) });
  }

  return NextResponse.json({ attempted: ready.length, results });
}
