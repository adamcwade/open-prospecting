import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getProspectDetail } from "@/lib/dashboard";
import { StatusBadge } from "@/components/StatusBadge";
import { ImpactBadge } from "@/components/ImpactBadge";
import { cardClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

function cleanUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Fallback for tasks predating the bullets column: split prose into points. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/[.!?]+$/, ""))
    .filter(Boolean);
}

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prospectId = Number(id);
  if (!Number.isInteger(prospectId)) notFound();

  const detail = await getProspectDetail(prospectId);
  if (!detail) notFound();
  const { prospect: p, tasks, script } = detail;

  const meta: ReactNode[] = [];
  if (p.industry) meta.push(<span key="industry">{p.industry}</span>);
  if (p.phone)
    meta.push(
      <span key="phone" className="font-label text-[11px]">
        {p.phone}
      </span>
    );
  if (p.email) meta.push(<span key="email">{p.email}</span>);
  if (p.websiteUrl)
    meta.push(
      <a
        key="website"
        href={p.websiteUrl}
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:underline"
      >
        {cleanUrl(p.websiteUrl)}
      </a>
    );

  const isDefaultTasks = tasks.length > 0 && tasks[0].isDefault;

  return (
    <main className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-label text-[11px] text-muted">Prospect</span>
          <Link
            href="/"
            className="font-label ml-auto text-[11px] text-text-secondary hover:text-text-primary"
          >
            ← Overview
          </Link>
        </div>

        {/* Header */}
        <section className={cardClass}>
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-3xl font-medium tracking-tight">
              {p.businessName}
            </h1>
            <StatusBadge status={p.status} />
          </div>

          {meta.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-text-secondary">
              {meta.map((item, i) => (
                <span key={i} className="flex items-center gap-2.5">
                  {i > 0 && <span className="text-muted">·</span>}
                  {item}
                </span>
              ))}
            </div>
          )}

          <div className="font-label mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-muted">
            {p.source && <span>Source: {p.source}</span>}
            <span>Discovered {new Date(p.discoveredAt).toLocaleDateString()}</span>
            <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
          </div>
        </section>

        {/* Value tasks */}
        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-label text-[11px] text-muted">
              Value tasks ({tasks.length})
            </span>
            {isDefaultTasks && (
              <span className="font-label text-[10px] text-muted">
                · generic (site unreachable)
              </span>
            )}
          </div>

          {tasks.length === 0 ? (
            <div className={`${cardClass} text-sm text-text-secondary`}>
              Not researched yet. Run research to generate the value tasks for
              this business.
            </div>
          ) : (
            <div className={`${cardClass} p-0`}>
              {tasks.map((t, i) => (
                <div
                  key={t.id}
                  className={`flex items-start gap-4 px-6 py-5 ${
                    i > 0 ? "border-t border-border-soft" : ""
                  }`}
                >
                  <span className="font-display mt-0.5 text-lg font-medium text-muted">
                    {t.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.title}</div>
                    <ul className="mt-2 space-y-1.5">
                      {(t.bullets.length ? t.bullets : splitSentences(t.description)).map(
                        (point, j) => (
                          <li
                            key={j}
                            className="flex gap-2.5 text-sm leading-relaxed text-text-secondary"
                          >
                            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                            <span>{point}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                  <ImpactBadge impact={t.impact} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Script plan */}
        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-label text-[11px] text-muted">Script plan</span>
          </div>
          {script ? (
            <div className={`${cardClass} space-y-5`}>
              <div>
                <div className="font-label text-[10px] text-muted">Call script</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {script.voiceScript}
                </p>
              </div>
              <div className="border-t border-border-soft pt-5">
                <div className="font-label text-[10px] text-muted">Message (SMS or email)</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {script.smsScript}
                </p>
              </div>
            </div>
          ) : (
            <div className={`${cardClass} text-sm text-text-secondary`}>
              No script yet. Scripting drafts a call script and outreach message
              once the prospect is researched.
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
