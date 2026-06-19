/**
 * Centralized environment + constant config.
 */

export const config = {
  discoveryDailyCap: Number(process.env.DISCOVERY_DAILY_CAP ?? 50),
  cronSecret: process.env.CRON_SECRET ?? "",

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: "claude-opus-4-8",
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
