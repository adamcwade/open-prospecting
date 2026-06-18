import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!config.onboardSecret || req.headers.get("x-onboard-secret") !== config.onboardSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { prospectId?: number };
  try {
    body = (await req.json()) as { prospectId?: number };
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (typeof body.prospectId !== "number") {
    return NextResponse.json({ error: "missing_prospectId" }, { status: 400 });
  }

  await db
    .update(prospects)
    .set({ status: "signed_up", updatedAt: new Date() })
    .where(eq(prospects.id, body.prospectId));

  return NextResponse.json({ ok: true });
}
