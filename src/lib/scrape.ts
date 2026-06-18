/**
 * Lightweight HTML fetch + contact extraction helpers for lead scraping.
 * No external deps: regex-based extraction over fetched HTML.
 */

export interface ScrapedContact {
  phone?: string;
  email?: string;
  businessName?: string;
}

const UA = "ModusBot/1.0 (+https://modus.app/bot)";

export async function fetchHtml(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// US-style phone numbers; permissive but anchored on separators.
const PHONE_RE =
  /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g;

/** Strip tags and decode a few entities for text scanning. */
function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function firstTitle(html: string): string | undefined {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1].trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t) return t[1].split(/[|\-–—]/)[0].trim();
  return undefined;
}

/** Prefer tel: / mailto: links, then fall back to text scanning. */
export function extractContact(html: string): ScrapedContact {
  const out: ScrapedContact = {};

  // tel: links are the most reliable phone source.
  const tel = html.match(/href=["']tel:([^"']+)["']/i);
  if (tel) {
    const digits = tel[1].replace(/\D/g, "");
    const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (ten.length === 10) out.phone = `+1${ten}`;
  }

  // mailto first (skip image/asset-like and example addresses).
  const mailto = html.match(/href=["']mailto:([^"'?]+)/i);
  if (mailto && !/sentry|example|\.png|\.jpg/i.test(mailto[1])) {
    out.email = mailto[1].trim().toLowerCase();
  }

  const text = toText(html);

  if (!out.email) {
    const emails = text.match(EMAIL_RE)?.filter(
      (e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e) && !/sentry|example/i.test(e)
    );
    if (emails?.length) out.email = emails[0].toLowerCase();
  }

  if (!out.phone) {
    const phoneMatch = PHONE_RE.exec(text);
    PHONE_RE.lastIndex = 0;
    if (phoneMatch) {
      out.phone = `+1${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}`;
    }
  }

  out.businessName = firstTitle(html);
  return out;
}
