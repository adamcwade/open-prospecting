import type { CandidateBusiness } from "./discovery";
import { TARGET_VERTICALS, config } from "./config";
import { extractContact, fetchHtml } from "./scrape";

interface SearchResult {
  title: string;
  url: string;
}

/** Serper.dev (Google Search API). Returns organic result links. */
async function serperSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": config.search.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 20 }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    organic?: { title: string; link: string }[];
  };
  return (data.organic ?? []).map((o) => ({ title: o.title, url: o.link }));
}

/** Brave Search API. */
async function braveSearch(query: string): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");
  const res = await fetch(url, {
    headers: {
      "X-Subscription-Token": config.search.apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    web?: { results?: { title: string; url: string }[] };
  };
  return (data.web?.results ?? []).map((r) => ({ title: r.title, url: r.url }));
}

async function search(query: string): Promise<SearchResult[]> {
  if (!config.search.apiKey) return [];
  if (config.search.provider === "serper") return serperSearch(query);
  if (config.search.provider === "brave") return braveSearch(query);
  return [];
}

interface PlaceResult {
  title: string;
  phone?: string;
  website?: string;
  category?: string;
}

/**
 * Serper "places" (Google Maps local results). Returns actual local businesses
 * with name, phone, and website directly — far better aligned with the local-SMB
 * ICP than organic web results.
 */
async function serperPlaces(query: string, gl?: string): Promise<PlaceResult[]> {
  const res = await fetch("https://google.serper.dev/places", {
    method: "POST",
    headers: {
      "X-API-KEY": config.search.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, ...(gl ? { gl } : {}) }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    places?: { title: string; phoneNumber?: string; website?: string; category?: string }[];
  };
  return (data.places ?? []).map((p) => ({
    title: p.title,
    phone: p.phoneNumber,
    website: p.website,
    category: p.category,
  }));
}

/** Local-business search terms per target vertical (better than the bare noun). */
const VERTICAL_QUERIES: Record<string, string> = {
  dental: "dentist",
  salon: "hair salon",
  hvac: "hvac contractor",
  law: "law firm",
  "real estate": "real estate agency",
  "auto repair": "auto repair shop",
};

/** Best-effort country code for Serper localization. */
function glFor(geography: string): string | undefined {
  const g = geography.toLowerCase();
  if (g.includes("canada")) return "ca";
  if (g.includes("united states") || g === "us" || g === "usa") return "us";
  if (g.includes("united kingdom") || g === "uk" || g.includes("britain")) return "gb";
  if (g.includes("australia")) return "au";
  return undefined;
}

/** Hosts we never want to treat as a business homepage. */
const SKIP_HOSTS =
  /(facebook|instagram|yelp|tripadvisor|linkedin|google|maps|youtube|twitter|x\.com|wikipedia|indeed|glassdoor|bbb\.org|angi\.com|thumbtack|nextdoor)\./i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Look up contact details for a place that Serper returned without a phone or
 * website (common for some categories, e.g. dental). Does an organic search for
 * the business name + location and scrapes the first real result. Best-effort.
 */
async function enrichContact(
  name: string,
  location: string
): Promise<{ phone?: string; email?: string; websiteUrl?: string }> {
  const results = await search(`${name} ${location}`);
  for (const r of results) {
    const host = hostOf(r.url);
    if (!host || SKIP_HOSTS.test(r.url)) continue;
    const homepage = `https://${host}`;
    const html = await fetchHtml(homepage);
    if (!html) continue;
    const contact = extractContact(html);
    if (contact.phone || contact.email) {
      return { phone: contact.phone, email: contact.email, websiteUrl: homepage };
    }
  }
  return {};
}

interface PlaceCandidate {
  businessName: string;
  industry: string;
  phone?: string;
  websiteUrl?: string;
  loc: string;
}

/**
 * Preferred discovery path: Serper "places" across each vertical × seed city.
 * Returns real local businesses. Entries Serper returns without a phone/website
 * (e.g. dental listings) are enriched on demand — only when actually selected —
 * via a name lookup, so those categories still yield callable leads. Buckets are
 * merged round-robin so the daily cap is shared fairly across verticals instead
 * of the first few exhausting it. Cross-run dedup + the cap are enforced in
 * `ingestCandidates`.
 */
async function discoverViaPlaces(
  limit: number,
  geography: string
): Promise<CandidateBusiness[]> {
  const seenPhones = new Set<string>();
  const seenHosts = new Set<string>();
  const seenKeys = new Set<string>();
  const gl = glFor(geography);
  const locations = config.search.cities.length ? config.search.cities : [geography];

  const buckets: PlaceCandidate[][] = [];
  for (const vertical of TARGET_VERTICALS) {
    const term = VERTICAL_QUERIES[vertical] ?? vertical;
    const bucket: PlaceCandidate[] = [];
    for (const loc of locations) {
      const places = await serperPlaces(`${term} in ${loc}`, gl);
      for (const pl of places) {
        if (!pl.title) continue;
        const phoneKey = (pl.phone ?? "").replace(/\D/g, "");
        const host = pl.website ? hostOf(pl.website) : null;
        if (host && SKIP_HOSTS.test(pl.website!)) continue;
        if (phoneKey && seenPhones.has(phoneKey)) continue;
        if (host && seenHosts.has(host)) continue;
        const key = `${vertical}|${pl.title.toLowerCase()}`;
        if (!phoneKey && !host && seenKeys.has(key)) continue;
        if (phoneKey) seenPhones.add(phoneKey);
        if (host) seenHosts.add(host);
        seenKeys.add(key);

        bucket.push({
          businessName: pl.title,
          industry: vertical,
          phone: pl.phone,
          websiteUrl: host ? `https://${host}` : undefined,
          loc,
        });
      }
    }
    buckets.push(bucket);
  }

  const out: CandidateBusiness[] = [];
  for (let i = 0; out.length < limit && buckets.some((b) => b.length); i++) {
    const entry = buckets[i % buckets.length].shift();
    if (!entry) continue;

    let phone = entry.phone;
    let websiteUrl = entry.websiteUrl;
    let email: string | undefined;
    if (!phone || !websiteUrl) {
      const enriched = await enrichContact(entry.businessName, entry.loc);
      phone = phone ?? enriched.phone;
      websiteUrl = websiteUrl ?? enriched.websiteUrl;
      email = enriched.email;
    }
    if (!phone && !websiteUrl) continue; // still unusable after enrichment

    out.push({
      businessName: entry.businessName,
      industry: entry.industry,
      phone,
      email,
      websiteUrl,
      source: `places:${config.search.provider}:${entry.loc}`,
    });
  }
  return out;
}

/**
 * Fallback discovery: organic web search per vertical + geography, then scrape
 * each candidate site for phone/email. Used for the Brave provider (no places
 * API) or if places returns nothing.
 */
async function discoverViaWebSearch(
  limit: number,
  geography: string
): Promise<CandidateBusiness[]> {
  const out: CandidateBusiness[] = [];
  const seenHosts = new Set<string>();

  for (const vertical of TARGET_VERTICALS) {
    if (out.length >= limit) break;

    const results = await search(`${vertical} business ${geography}`);

    for (const r of results) {
      if (out.length >= limit) break;

      const host = hostOf(r.url);
      if (!host || SKIP_HOSTS.test(r.url) || seenHosts.has(host)) continue;
      seenHosts.add(host);

      const homepage = `https://${host}`;
      const html = await fetchHtml(homepage);
      if (!html) continue;

      const contact = extractContact(html);
      if (!contact.phone && !contact.email) continue; // unusable

      out.push({
        businessName: contact.businessName ?? r.title.split(/[|\-–—]/)[0].trim(),
        industry: vertical,
        phone: contact.phone,
        email: contact.email,
        websiteUrl: homepage,
        source: `web_search:${config.search.provider}`,
      });
    }
  }

  return out;
}

/**
 * Lead discovery. Prefers Serper "places" (real local businesses) and falls
 * back to organic web search + scraping for other providers.
 *
 * Returns [] when no search provider is configured (safe no-op).
 */
export async function discoverCandidates(
  limit: number,
  geography = config.search.geography
): Promise<CandidateBusiness[]> {
  if (!config.search.apiKey) return [];
  if (config.search.provider === "serper") {
    const viaPlaces = await discoverViaPlaces(limit, geography);
    if (viaPlaces.length > 0) return viaPlaces;
  }
  return discoverViaWebSearch(limit, geography);
}
