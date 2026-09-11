"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusLabels, type CrmRecord } from "@/lib/outreach/crm";
import { mailAngleFor, type MailAngleId } from "@/lib/outreach/mail-angle";

type Row = {
  row: CrmRecord;
  angle: ReturnType<typeof mailAngleFor>;
};

type Props = {
  rows: Row[];
};

type FitFilter = "all" | "mailable" | "jubileum" | "algemeen" | "past_niet" | "in_region" | "out_region" | "has_email" | "no_email";

function angleTone(id: string) {
  if (id === "jubileum") return "accent" as const;
  if (id === "algemeen") return "success" as const;
  if (id === "past_niet" || id === "niet_mailen") return "danger" as const;
  return "neutral" as const;
}

function fmt(iso: string | null) {
  if (!iso) return "Nog geen contact";
  return format(new Date(iso), "d MMM yyyy", { locale: nl });
}

const FILTERS: { id: FitFilter; label: string }[] = [
  { id: "all", label: "Alles" },
  { id: "mailable", label: "Klaar om te mailen" },
  { id: "jubileum", label: "Jubileum" },
  { id: "algemeen", label: "Algemeen feest" },
  { id: "past_niet", label: "Past niet" },
  { id: "in_region", label: "In regio" },
  { id: "out_region", label: "Buiten regio" },
  { id: "has_email", label: "Met e-mail" },
  { id: "no_email", label: "Zonder e-mail" },
];

export function CrmCompaniesTable({ rows }: Props) {
  const [filter, setFilter] = useState<FitFilter>("mailable");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(({ row, angle }) => {
      if (needle && !row.companyName.toLowerCase().includes(needle)) {
        return false;
      }
      switch (filter) {
        case "mailable":
          return angle.id === "jubileum" || angle.id === "algemeen";
        case "jubileum":
        case "algemeen":
        case "past_niet":
          return angle.id === (filter as MailAngleId);
        case "in_region":
          return row.inRegion;
        case "out_region":
          return Boolean(row.city || row.kvkCity || row.apolloCity) && !row.inRegion;
        case "has_email":
          return Boolean(row.email);
        case "no_email":
          return !row.email;
        default:
          return true;
      }
    });
  }, [rows, filter, q]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={
              filter === f.id
                ? "bg-accent px-3 py-1.5 font-display text-xs tracking-[0.1em] text-accent-contrast"
                : "border border-border bg-surface px-3 py-1.5 font-display text-xs tracking-[0.1em] text-text-muted hover:border-accent"
            }
          >
            {f.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek bedrijf…"
          className="ml-auto min-w-[10rem] flex-1 border border-border bg-bg px-3 py-1.5 text-sm text-text sm:max-w-xs"
        />
      </div>

      <p className="mb-3 text-xs text-text-dim">
        {filtered.length} van {rows.length} · Apollo-mdw heeft voorkeur boven
        KvK-vestiging · regio = Amsterdam + ~50 km
      </p>

      {filtered.length === 0 ? (
        <p className="border border-border bg-surface px-4 py-5 text-sm text-text-muted">
          Geen bedrijven in dit filter.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Bedrijf</th>
                <th className="px-4 py-3 font-medium">Mailhoek</th>
                <th className="px-4 py-3 font-medium">Apollo mdw</th>
                <th className="px-4 py-3 font-medium">KvK mdw</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Mails</th>
                <th className="px-4 py-3 font-medium">Replies</th>
                <th className="px-4 py-3 font-medium">Laatst contact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ row, angle }) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/outreach/crm/${row.id}`}
                      className="text-text hover:text-accent"
                    >
                      {row.companyName}
                    </Link>
                    <p className="text-xs text-text-dim">
                      {row.city ?? "—"}
                      {!row.inRegion && (row.city || row.kvkCity)
                        ? " · buiten regio"
                        : ""}
                      {row.email ? ` · ${row.email}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={angleTone(angle.id)}>
                      {angle.label}
                    </StatusBadge>
                    <p className="mt-1 max-w-[200px] text-xs text-text-dim">
                      {angle.detail}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-text-muted">
                    {row.apolloEmployeeCount != null
                      ? `~${row.apolloEmployeeCount}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-text-muted">
                    {row.kvkEmployeeCount != null ? row.kvkEmployeeCount : "—"}
                    {row.kvkHeadcountOff ? (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-warn">
                        laag?
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      tone={
                        row.status === "lead" || row.status === "replied"
                          ? "accent"
                          : row.status === "excluded"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {statusLabels[row.status]}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 font-mono">{row.mailCount}</td>
                  <td className="px-4 py-3 font-mono">{row.replyCount}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {fmt(row.lastTouchAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
