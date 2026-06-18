import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { config } from "../config";
import { generateJson } from "../anthropic";
import type { TranscriptTurn } from "./realtime-bridge";

// Strict-enough email shape; rejects spoken artifacts the model might leave in.
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Validate + normalize a candidate email. Returns null if it isn't a clean address. */
export function normalizeEmail(candidate: string | null | undefined): string | null {
  const e = (candidate ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return EMAIL_RE.test(e) ? e : null;
}

/**
 * Extract the email the prospect gave during the call from the transcript and
 * persist it to the prospect. The owner stating their address on the call is the
 * highest-quality source, so it overwrites any scraped/placeholder email already
 * on file. Best-effort: no API key, no clearly stated email, or an invalid
 * result all leave the existing value untouched. Returns the captured email.
 */
export async function captureCallEmail(
  prospectId: number,
  turns: TranscriptTurn[]
): Promise<string | null> {
  if (!config.anthropic.apiKey) return null;

  // Only the prospect's own words can contain their email.
  const userText = turns
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join("\n")
    .trim();
  if (!userText) return null;

  let candidate: string | null = null;
  try {
    const { email } = await generateJson<{ email: string | null }>({
      system:
        "Extract the customer's email address from this sales call transcript. They may have " +
        "spelled it out or said words like 'at', 'dot', 'underscore', or 'dash'. Convert it to a " +
        "normal address (e.g. 'john dot smith at gmail dot com' -> 'john.smith@gmail.com'). " +
        'Respond as JSON: {"email":"..."} or {"email":null} if none was clearly given.',
      prompt: userText,
      maxTokens: 100,
    });
    candidate = email;
  } catch {
    return null;
  }

  const email = normalizeEmail(candidate);
  if (!email) return null;

  await db
    .update(prospects)
    .set({ email, updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));
  return email;
}
