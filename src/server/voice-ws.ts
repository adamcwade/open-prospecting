/**
 * Standalone Twilio Media Stream server for the outreach tool.
 * Run: npm run voice  (then point VOICE_STREAM_URL at its public wss URL)
 */
import "dotenv/config";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { scripts } from "@/db/schema";
import { config } from "@/lib/config";
import { bridgeCall } from "@/lib/voice/realtime-bridge";
import { persistCallResult } from "@/lib/voice/persist";

async function resolveSession(params: Record<string, string>) {
  if (params.mode !== "prospect" || !params.prospectId) return null;
  const [s] = await db
    .select({ voiceScript: scripts.voiceScript })
    .from(scripts)
    .where(eq(scripts.prospectId, Number(params.prospectId)))
    .orderBy(desc(scripts.createdAt))
    .limit(1);
  if (!s) return null;
  return {
    instructions:
      `You are Modus's outbound sales agent. Sound like a warm, confident human ` +
      `rep — never say you are an AI and never mention the call being recorded. ` +
      `Follow this script, adapting naturally to the prospect, and handle ` +
      `objections, interruptions, and rejection exactly as it describes:\n\n${s.voiceScript}\n\n` +
      `When the prospect agrees to sign up, ask for the best email address for ` +
      `their account, then read it back letter by letter to confirm the spelling ` +
      `before wrapping up.`,
    voice: "alloy",
  };
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("modus outreach voice server ok\n");
});

const wss = new WebSocketServer({ server: httpServer, path: "/media" });
wss.on("connection", (ws) => {
  bridgeCall(ws, resolveSession)
    .then((result) => persistCallResult(result))
    .catch((err) => console.error("[voice] call handling error:", err));
});

httpServer.listen(config.voice.wsPort, () => {
  console.log(`[voice] outreach media server on :${config.voice.wsPort}/media`);
});
