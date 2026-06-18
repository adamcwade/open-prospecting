import WebSocket from "ws";
import { config } from "../config";
import { isStopKeyword } from "../compliance";

export interface TranscriptTurn {
  role: "assistant" | "user";
  text: string;
  ts: number;
}

export interface CallResult {
  turns: TranscriptTurn[];
  params: Record<string, string>;
  streamSid?: string;
  stopRequested: boolean;
  agreed: boolean;
}

const AGREE_RE =
  /\b(yes,? (i'?m|we'?re) in|sign me up|let'?s do it|sounds good,? let'?s|i'?ll (take|do) it|sure,? set it up|count me in|where do i (sign|pay))\b/i;

/**
 * Bridge a single Twilio Media Stream connection to an OpenAI Realtime session.
 * Audio stays in g711_ulaw end-to-end (no transcoding).
 *
 * The OpenAI session is opened only after Twilio's `start` event delivers the
 * call's custom parameters, so `resolveSession` can choose the right
 * instructions (prospect script vs. client receptionist) per call.
 *
 * Resolves with the full transcript and detected intents when either side ends.
 */
export function bridgeCall(
  twilioWs: WebSocket,
  resolveSession: (
    params: Record<string, string>
  ) => Promise<{ instructions: string; voice?: string } | null>,
  now: () => number = () => Date.now()
): Promise<CallResult> {
  return new Promise((resolve) => {
    const turns: TranscriptTurn[] = [];
    const result: CallResult = {
      turns,
      params: {},
      stopRequested: false,
      agreed: false,
    };
    let streamSid: string | undefined;
    let openai: WebSocket | null = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      result.streamSid = streamSid;
      try {
        openai?.close();
      } catch {}
      try {
        twilioWs.close();
      } catch {}
      resolve(result);
    };

    const startOpenAi = (session: { instructions: string; voice?: string }) => {
      openai = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
          config.openai.realtimeModel
        )}`,
        {
          headers: {
            Authorization: `Bearer ${config.openai.apiKey}`,
            "OpenAI-Beta": "realtime=v1",
          },
        }
      );

      openai.on("open", () => {
        openai!.send(
          JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["audio", "text"],
              instructions: session.instructions,
              voice: session.voice ?? "alloy",
              input_audio_format: "g711_ulaw",
              output_audio_format: "g711_ulaw",
              turn_detection: { type: "server_vad", silence_duration_ms: 600 },
              input_audio_transcription: { model: config.openai.sttModel },
            },
          })
        );
        // Agent speaks first (delivers the script opener).
        openai!.send(JSON.stringify({ type: "response.create" }));
      });

      openai.on("message", (raw) => {
        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(raw.toString());
        } catch {
          return;
        }

        switch (evt.type) {
          case "response.audio.delta": {
            const delta = evt.delta as string;
            if (streamSid && delta) {
              twilioWs.send(
                JSON.stringify({ event: "media", streamSid, media: { payload: delta } })
              );
            }
            break;
          }
          case "input_audio_buffer.speech_started": {
            // Barge-in: stop playback and cancel the in-flight response.
            if (streamSid) twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
            openai!.send(JSON.stringify({ type: "response.cancel" }));
            break;
          }
          case "conversation.item.input_audio_transcription.completed": {
            const text = String(evt.transcript ?? "").trim();
            if (text) {
              turns.push({ role: "user", text, ts: now() });
              if (isStopKeyword(text)) {
                result.stopRequested = true;
                finish();
              } else if (AGREE_RE.test(text)) {
                result.agreed = true;
              }
            }
            break;
          }
          case "response.audio_transcript.done": {
            const text = String(evt.transcript ?? "").trim();
            if (text) turns.push({ role: "assistant", text, ts: now() });
            break;
          }
          case "error": {
            console.error("[voice] OpenAI realtime error:", evt.error);
            break;
          }
        }
      });

      openai.on("close", finish);
      openai.on("error", (err) => {
        console.error("[voice] OpenAI ws error:", err);
        finish();
      });
    };

    // --- Twilio -> us ---
    twilioWs.on("message", async (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.event) {
        case "start": {
          const start = msg.start as {
            streamSid: string;
            customParameters?: Record<string, string>;
          };
          streamSid = start.streamSid;
          result.params = start.customParameters ?? {};
          const session = await resolveSession(result.params);
          if (!session) {
            finish();
            return;
          }
          startOpenAi(session);
          break;
        }
        case "media": {
          const media = msg.media as { payload: string };
          if (openai?.readyState === WebSocket.OPEN && media?.payload) {
            openai.send(
              JSON.stringify({ type: "input_audio_buffer.append", audio: media.payload })
            );
          }
          break;
        }
        case "stop": {
          finish();
          break;
        }
      }
    });

    twilioWs.on("close", finish);
    twilioWs.on("error", finish);
  });
}
