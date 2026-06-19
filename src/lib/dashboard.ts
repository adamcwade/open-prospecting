import { db } from "@/db";
import { prospects, researchTasks, scripts } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";

export interface ProspectStats {
  total: number;
  newCount: number; // discovered, not researched yet
  researched: number; // value tasks generated
  scripted: number; // script + message ready, good to reach out
  withPhone: number;
  withEmail: number;
}

/** Headline counts for the overview: how big the list is and how far along it is. */
export async function getStats(): Promise<ProspectStats> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      newCount: sql<number>`count(*) filter (where ${prospects.status} in ('new','incomplete'))::int`,
      researched: sql<number>`count(*) filter (where ${prospects.status} = 'researched')::int`,
      scripted: sql<number>`count(*) filter (where ${prospects.status} = 'scripted')::int`,
      withPhone: sql<number>`count(*) filter (where ${prospects.phone} is not null)::int`,
      withEmail: sql<number>`count(*) filter (where ${prospects.email} is not null)::int`,
    })
    .from(prospects);

  return row;
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
}

/**
 * Load a single prospect plus its researched value tasks (ordered revenue →
 * cost → other via `position`) and the latest generated call script + outreach
 * message. Returns null when no prospect has that id so the page can render a 404.
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

  return { prospect, tasks, script: script ?? null };
}
