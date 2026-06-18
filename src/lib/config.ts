/**
 * Centralized environment + constant config for Modus.
 */

export const config = {
  discoveryDailyCap: Number(process.env.DISCOVERY_DAILY_CAP ?? 50),
  subscriptionPriceCents: 3500,
  selfReviewEveryCalls: 5,
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3100",
  cronSecret: process.env.CRON_SECRET ?? "",
  // Where prospects sign up (the client-facing Modus site).
  signupUrl: process.env.SIGNUP_URL ?? "https://modus.app/signup",
  // Customer app onboarding endpoint + shared secret for the server-to-server handoff.
  appOnboardUrl: process.env.APP_ONBOARD_URL ?? "",
  onboardSecret: process.env.ONBOARD_SECRET ?? "",

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: "claude-opus-4-8",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
    sttModel: process.env.OPENAI_STT_MODEL ?? "gpt-4o-transcribe",
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID ?? "",
    outboundPool: (process.env.TWILIO_OUTBOUND_POOL ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean),
  },
  search: {
    // "serper" | "brave" | "none"
    provider: (process.env.SEARCH_PROVIDER ?? "none") as
      | "serper"
      | "brave"
      | "none",
    apiKey: process.env.SEARCH_API_KEY ?? "",
    geography: process.env.DISCOVERY_GEOGRAPHY ?? "United States",
    // City seeds for local "places" discovery (comma-separated). When empty,
    // discovery searches the geography as a single broad location.
    cities: (process.env.DISCOVERY_CITIES ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
  },
  voice: {
    // Public wss:// base where the Twilio Media Stream server is reachable.
    streamUrl: process.env.VOICE_STREAM_URL ?? "",
    // Public https:// base Twilio uses for voice webhooks (defaults to app url).
    publicUrl: process.env.PUBLIC_URL ?? process.env.APP_BASE_URL ?? "",
    wsPort: Number(process.env.VOICE_WS_PORT ?? 8080),
  },
} as const;

/** Target verticals for prospecting focus (local service SMBs). */
export const TARGET_VERTICALS = [
  "dental",
  "salon",
  "hvac",
  "law",
  "real estate",
  "auto repair",
] as const;

