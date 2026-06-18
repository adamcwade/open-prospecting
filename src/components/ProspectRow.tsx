"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { StatusBadge } from "./StatusBadge";

export interface ProspectRowData {
  id: number;
  businessName: string;
  industry: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  status: string;
}

/**
 * A prospect table row that navigates to the prospect's detail page when
 * clicked or activated by keyboard. The row is the leaf of a server-rendered
 * table, so navigation is done with the client router rather than wrapping a
 * `<tr>` in a `<Link>` (which is invalid DOM). The website link stops
 * propagation so it still opens the site without triggering navigation.
 */
export function ProspectRow({ p }: { p: ProspectRowData }) {
  const router = useRouter();
  const href = `/prospects/${p.id}`;

  function go() {
    router.push(href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  }

  function onWebsiteClick(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={`View ${p.businessName} details`}
      onClick={go}
      onKeyDown={onKeyDown}
      className="cursor-pointer border-t border-border-soft transition-colors hover:bg-white/5 focus:bg-white/5 focus:outline-none"
    >
      <td className="px-6 py-4 font-medium">{p.businessName}</td>
      <td className="px-6 py-4 text-text-secondary">{p.industry}</td>
      <td className="px-6 py-4 font-label text-[11px] text-muted">{p.phone}</td>
      <td className="px-6 py-4 text-text-secondary">{p.email}</td>
      <td className="px-6 py-4 text-text-secondary">
        {p.websiteUrl ? (
          <a
            href={p.websiteUrl}
            target="_blank"
            rel="noreferrer"
            onClick={onWebsiteClick}
            className="text-primary hover:underline"
          >
            {p.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-6 py-4">
        <StatusBadge status={p.status} />
      </td>
    </tr>
  );
}
