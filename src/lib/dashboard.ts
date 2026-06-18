import { db } from "@/db";
import {
  contactAttempts,
  optOuts,
  prospects,
  researchTasks,
  scripts,
  strategies,
  transcripts,
} from "@/db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

export interface OutreachStats {
  prospectsTotal: number;
  callsTotal: number;
  connected: number;
  hangups: number; // no answer / voicemail / failed
  sales: number; // calls that led to an agreement
  remainingCalls: number; // prospects not yet called
  optOuts: number;
  connectRate: number;
  saleRate: number;
}

export async function getStats(): Promise<OutreachStats> {
  const [
    [{ prospectsTotal }],
    [{ callsTotal }],
    [{ connected }],
    [{ hangups }],
    [{ sales }],
    [{ optOutCount }],
    [{ calledProspects }],
  ] = await Promise.all([
    db.select({ prospectsTotal: sql<number>`count(*)::int` }).from(prospects),
    db
      .select({ callsTotal: sql<number>`count(*)::int` })
      .from(contactAttempts)
      .where(eq(contactAttempts.channel, "voice")),
    db
      .select({ connected: sql<number>`count(*)::int` })
      .from(contactAttempts)
      .where(eq(contactAttempts.outcome, "connected")),
    db
      .select({ hangups: sql<number>`count(*)::int` })
      .from(contactAttempts)
      .where(
        inArray(contactAttempts.outcome, ["no_answer", "voicemail", "failed"])
      ),
    db
      .select({ sales: sql<number>`count(*)::int` })
      .from(contactAttempts)
      .where(eq(contactAttempts.outcome, "agreed")),
    db.select({ optOutCount: sql<number>`count(*)::int` }).from(optOuts),
    db
      .select({
        calledProspects: sql<number>`count(distinct ${contactAttempts.prospectId})::int`,
      })
      .from(contactAttempts)
      .where(eq(contactAttempts.channel, "voice")),
  ]);

  return {
    prospectsTotal,
    callsTotal,
    connected,
    hangups,
    sales,
    remainingCalls: Math.max(0, prospectsTotal - calledProspects),
    optOuts: optOutCount,
    connectRate: callsTotal ? connected / callsTotal : 0,
    saleRate: callsTotal ? sales / callsTotal : 0,
  };
}

export type ProspectSort =
  | "businessName"
  | "industry"
  | "phone"
  | "email"
  | "status"
  | "updatedAt";
export type SortDir = "asc" | "desc";

const SORT_COLUMNS = {
  businessName: prospects.businessName,
  industry: prospects.industry,
  phone: prospects.phone,
  email: prospects.email,
  status: prospects.status,
  updatedAt: prospects.updatedAt,
} as const;

export interface ProspectPage {
  rows: (typeof prospects.$inferSelect)[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort: ProspectSort;
  dir: SortDir;
}

/** Paginated, sortable prospect list for the overview table. */
export async function getProspects(opts: {
  page?: number;
  pageSize?: number;
  sort?: ProspectSort;
  dir?: SortDir;
} = {}): Promise<ProspectPage> {
  const pageSize = opts.pageSize ?? 25;
  const sort: ProspectSort =
    opts.sort && opts.sort in SORT_COLUMNS ? opts.sort : "updatedAt";
  const dir: SortDir = opts.dir === "asc" ? "asc" : "desc";
  const column = SORT_COLUMNS[sort];
  const direction = dir === "asc" ? asc : desc;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(prospects);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(opts.page ?? 1) || 1), pageCount);

  const rows = await db
    .select()
    .from(prospects)
    // id as a stable tiebreaker so pagination is deterministic across pages.
    .orderBy(direction(column), desc(prospects.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total, page, pageSize, pageCount, sort, dir };
}

export interface ProspectDetail {
  prospect: typeof prospects.$inferSelect;
  tasks: (typeof researchTasks.$inferSelect)[];
  script: typeof scripts.$inferSelect | null;
  strategy: typeof strategies.$inferSelect | null;
}

/**
 * Load a single prospect plus its researched value tasks (ordered revenue →
 * cost → other via `position`), the latest generated voice/SMS script, and the
 * strategy behind it (the one the script was generated under, falling back to
 * the active strategy). Returns null when no prospect has that id so the page
 * can render a 404.
 */
export async function getProspectDetail(
  id: number
): Promise<ProspectDetail | null> {
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, id))
    .limit(1);
  if (!prospect) return null;

  const tasks = await db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.prospectId, id))
    .orderBy(researchTasks.position);

  const [script] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.prospectId, id))
    .orderBy(desc(scripts.createdAt))
    .limit(1);

  // Prefer the strategy the script was generated under; otherwise show the
  // currently active strategy. Either may be absent (table is empty until calls
  // trigger a self-review), in which case the page omits the strategy block.
  let strategy: typeof strategies.$inferSelect | null = null;
  if (script?.strategyId) {
    const rows = await db
      .select()
      .from(strategies)
      .where(eq(strategies.id, script.strategyId))
      .limit(1);
    strategy = rows[0] ?? null;
  } else {
    const rows = await db
      .select()
      .from(strategies)
      .where(eq(strategies.isActive, true))
      .orderBy(desc(strategies.version))
      .limit(1);
    strategy = rows[0] ?? null;
  }

  return { prospect, tasks, script: script ?? null, strategy };
}

export interface CallRow {
  id: number;
  startedAt: Date;
  endedAt: Date | null;
  outcome: string | null;
  durationSeconds: number | null;
  businessName: string;
  prospectId: number;
  summary: string | null;
  turns: unknown;
  isSale: boolean;
}

export async function getCalls(limit = 100): Promise<CallRow[]> {
  const rows = await db
    .select({
      id: contactAttempts.id,
      startedAt: contactAttempts.startedAt,
      endedAt: contactAttempts.endedAt,
      outcome: contactAttempts.outcome,
      durationSeconds: contactAttempts.durationSeconds,
      prospectId: contactAttempts.prospectId,
      businessName: prospects.businessName,
      summary: transcripts.summary,
      turns: transcripts.turns,
    })
    .from(contactAttempts)
    .innerJoin(prospects, eq(contactAttempts.prospectId, prospects.id))
    .leftJoin(transcripts, eq(transcripts.attemptId, contactAttempts.id))
    .where(eq(contactAttempts.channel, "voice"))
    .orderBy(desc(contactAttempts.startedAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, isSale: r.outcome === "agreed" }));
}
