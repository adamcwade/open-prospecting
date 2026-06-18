import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { dialProspect } from "@/lib/voice/dialer";

/**
 * POST /api/calls/start  { prospectId: number }
 * Places an outbound prospecting call. Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (config.cronSecret && auth !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { prospectId?: number };
  if (!body.prospectId) {
    return NextResponse.json({ error: "prospectId required" }, { status: 400 });
  }

  const result = await dialProspect(body.prospectId);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
