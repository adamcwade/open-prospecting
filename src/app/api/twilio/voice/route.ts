import { NextRequest } from "next/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!)
  );
}

function xml(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/** Twilio voice webhook for outbound prospecting calls. */
async function handle(req: NextRequest): Promise<Response> {
  const prospectId = req.nextUrl.searchParams.get("prospectId");
  if (prospectId) {
    const params = [
      `<Parameter name="mode" value="prospect"/>`,
      `<Parameter name="prospectId" value="${escapeXml(prospectId)}"/>`,
    ].join("");
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response><Connect><Stream url="${config.voice.streamUrl}">${params}</Stream></Connect></Response>`
    );
  }
  return xml(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Goodbye.</Say><Hangup/></Response>`
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
