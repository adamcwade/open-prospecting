import Link from "next/link";
import { getProspects, getStats, type ProspectSort, type SortDir } from "@/lib/dashboard";
import { ProspectRow } from "@/components/ProspectRow";
import { cardClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const COLUMNS: { key: ProspectSort | "website"; label: string; sortable: boolean }[] = [
  { key: "businessName", label: "Business", sortable: true },
  { key: "industry", label: "Industry", sortable: true },
  { key: "phone", label: "Phone", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "website", label: "Website", sortable: false },
  { key: "status", label: "Status", sortable: true },
];

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const sortParam = sp.sort as ProspectSort | undefined;
  const dirParam: SortDir | undefined = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : undefined;
  const pageParam = Number(sp.page);

  const [stats, list] = await Promise.all([
    getStats(),
    getProspects({
      sort: sortParam,
      dir: dirParam,
      page: Number.isFinite(pageParam) ? pageParam : 1,
    }),
  ]);
  const { rows, total, page, pageSize, pageCount, sort, dir } = list;

  const cards = [
    { label: "Total calls", value: stats.callsTotal, hero: true },
    { label: "Sales", value: stats.sales, hero: true },
    { label: "Hangups / no answer", value: stats.hangups },
    { label: "Remaining to call", value: stats.remainingCalls },
    { label: "Prospects", value: stats.prospectsTotal },
    { label: "Connect rate", value: pct(stats.connectRate) },
    { label: "Sale rate", value: pct(stats.saleRate) },
    { label: "Opt-outs", value: stats.optOuts },
  ];

  // Clicking a sortable header sorts ascending, or flips direction if already active.
  const sortHref = (col: ProspectSort) => {
    const nextDir: SortDir = sort === col && dir === "asc" ? "desc" : "asc";
    return `/?sort=${col}&dir=${nextDir}&page=1`;
  };
  const pageHref = (p: number) => `/?sort=${sort}&dir=${dir}&page=${p}`;
  const arrow = (col: ProspectSort) => (sort === col ? (dir === "asc" ? " ↑" : " ↓") : "");

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <main className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-label text-[11px] text-muted">Operator overview</span>
        </div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Prospecting</h1>

        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className={`${cardClass} ${c.hero ? "col-span-2 sm:col-span-1" : ""}`}
            >
              <span className="font-label text-[11px] text-muted">{c.label}</span>
              <div
                className={`font-display mt-3 font-medium ${
                  c.hero ? "text-4xl text-primary" : "text-3xl"
                }`}
              >
                {c.value}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-label text-[11px] text-muted">
              Prospect list ({total})
            </span>
          </div>
          <div className={`${cardClass} overflow-x-auto p-0`}>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border">
                <tr className="font-label text-[10px] text-muted">
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-6 py-4 font-semibold">
                      {c.sortable ? (
                        <Link
                          href={sortHref(c.key as ProspectSort)}
                          className={`hover:text-text-primary ${
                            sort === c.key ? "text-primary" : ""
                          }`}
                        >
                          {c.label}
                          {arrow(c.key as ProspectSort)}
                        </Link>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td className="px-6 py-5 text-muted" colSpan={COLUMNS.length}>
                      No prospects yet. Run discovery to populate the list.
                    </td>
                  </tr>
                )}
                {rows.map((p) => (
                  <ProspectRow key={p.id} p={p} />
                ))}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="mt-4 flex items-center justify-between text-[11px] text-muted">
              <span className="font-label">
                Showing {from}–{to} of {total}
              </span>
              <div className="flex items-center gap-3">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="text-primary hover:underline">
                    ← Prev
                  </Link>
                ) : (
                  <span className="opacity-40">← Prev</span>
                )}
                <span className="font-label">
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <Link href={pageHref(page + 1)} className="text-primary hover:underline">
                    Next →
                  </Link>
                ) : (
                  <span className="opacity-40">Next →</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
