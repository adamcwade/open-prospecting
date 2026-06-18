import { NextRequest } from "next/server";
import { isStopKeyword, optOut } from "@/lib/compliance";

/** Inbound SMS webhook: honor STOP / opt-out keywords (DNC). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = String(form.get("From") ?? "");
  const body = String(form.get("Body") ?? "");

  let reply = "";
  if (from && isStopKeyword(body)) {
    await optOut(from, "stop_keyword");
    reply = "You have been unsubscribed and will not be contacted again.";
  }

  const twiml = reply
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
}
