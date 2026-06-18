import { getCalls, type CallRow } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

interface Turn {
  role: "assistant" | "user";
  text: string;
}

function outcomeTone(outcome: string | null) {
  if (outcome === "agreed") return "bg-primary text-white";
  if (outcome === "connected") return "bg-primary/15 text-primary";
  if (outcome === "opted_out") return "bg-white/5 text-muted";
  return "bg-white/5 text-text-secondary";
}

function Transcript({ turns }: { turns: unknown }) {
  const list = Array.isArray(turns) ? (turns as Turn[]) : [];
  if (!list.length) return null;
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border-soft pt-4">
      {list.map((t, i) => (
        <div
          key={i}
          className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
            t.role === "assistant"
              ? "self-end bg-primary text-white"
              : "self-start border border-border bg-[#15140f] text-text-secondary"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default async function CallsPage() {
  const calls: CallRow[] = await getCalls();

  return (
    <main className="px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-label text-[11px] text-muted">Call history</span>
        </div>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Calls &amp; transcripts
        </h1>

        <div className="mt-8 space-y-4">
          {calls.length === 0 && (
            <p className="text-sm text-text-secondary">No calls recorded yet.</p>
          )}
          {calls.map((c) => (
            <div
              key={c.id}
              className={`rounded-[24px] border bg-surface p-6 ${
                c.isSale ? "border-primary" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-display font-medium">{c.businessName}</div>
                  <div className="font-label mt-1 text-[10px] text-muted">
                    {new Date(c.startedAt).toLocaleString()}
                    {c.durationSeconds ? ` · ${c.durationSeconds}s` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.isSale && (
                    <span className="font-label rounded-full bg-primary px-2.5 py-1 text-[10px] text-white">
                      Sale
                    </span>
                  )}
                  <span
                    className={`font-label rounded-full px-2.5 py-1 text-[10px] ${outcomeTone(
                      c.outcome
                    )}`}
                  >
                    {c.outcome ?? "pending"}
                  </span>
                </div>
              </div>
              {c.summary && (
                <p className="mt-3 text-sm text-text-secondary">{c.summary}</p>
              )}
              <Transcript turns={c.turns} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
