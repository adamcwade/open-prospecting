import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { ingestCandidates, remainingToday } from "@/lib/discovery";
import { discoverCandidates } from "@/lib/discovery-source";

/**
 * Daily discovery cron. Adds up to the remaining slots (cap = 50/day).
 * Protect with CRON_SECRET via the Authorization header.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (config.cronSecret && auth !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const remaining = await remainingToday();
  if (remaining <= 0) {
    return NextResponse.json({ inserted: 0, remaining: 0, capped: true });
  }

  const candidates = await discoverCandidates(remaining);
  const result = await ingestCandidates(candidates);

  return NextResponse.json({ ...result, cap: config.discoveryDailyCap });
}
