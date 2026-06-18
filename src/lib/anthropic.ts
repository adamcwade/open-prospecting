import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";

let _anthropic: Anthropic | null = null;

/** Lazily construct the Anthropic client so builds without env vars do not crash. */
export function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return _anthropic;
}

/**
 * Small helper: ask Claude for a single JSON object matching a shape, and parse it.
 * Throws if the model returns non-JSON.
 */
export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const msg = await getAnthropic().messages.create({
    model: config.anthropic.model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Expected JSON from model, got: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as T;
}
