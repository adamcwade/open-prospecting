import twilio from "twilio";
import { config } from "./config";

let _client: ReturnType<typeof twilio> | null = null;

/** Lazily construct the Twilio REST client. */
export function getTwilio() {
  if (!_client) {
    _client = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return _client;
}

/** Send an SMS. Uses the Messaging Service if configured, else an explicit from. */
export async function sendSms(opts: {
  to: string;
  body: string;
  from?: string;
}) {
  const base: { to: string; body: string } = { to: opts.to, body: opts.body };
  if (config.twilio.messagingServiceSid) {
    return getTwilio().messages.create({
      ...base,
      messagingServiceSid: config.twilio.messagingServiceSid,
    });
  }
  if (!opts.from) throw new Error("sendSms: no from number and no messaging service");
  return getTwilio().messages.create({ ...base, from: opts.from });
}

/** Place an outbound call whose media is streamed to our voice server. */
export async function placeCall(opts: {
  to: string;
  from: string;
  twimlUrl: string;
  statusCallback: string;
}) {
  return getTwilio().calls.create({
    to: opts.to,
    from: opts.from,
    url: opts.twimlUrl,
    statusCallback: opts.statusCallback,
    statusCallbackEvent: ["completed", "no-answer", "busy", "failed"],
    machineDetection: "Enable",
  });
}
