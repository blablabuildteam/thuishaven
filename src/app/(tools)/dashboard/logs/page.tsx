import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import {
  countRecentIntegrationErrors,
  listIntegrationLogs,
  type IntegrationLogLevel,
} from "@/lib/integrations/log";
import { weeztixTokenStatus } from "@/lib/integrations/weeztix/tokens";

export const metadata = { title: "Koppelingen-log" };
export const dynamic = "force-dynamic";

function isLevel(v: string | undefined): v is IntegrationLogLevel {
  return v === "info" || v === "error";
}

export default async function IntegrationLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; source?: string }>;
}) {
  const sp = await searchParams;
  const level = isLevel(sp.level) ? sp.level : undefined;
  const source = sp.source?.trim() || undefined;

  const [logs, errorCount, weeztix] = await Promise.all([
    listIntegrationLogs({ limit: 100, level, source }),
    countRecentIntegrationErrors(24),
    weeztixTokenStatus(),
  ]);

  const accessLabel = weeztix.accessExpiresAt
    ? format(new Date(weeztix.accessExpiresAt), "d MMM yyyy HH:mm", {
        locale: nl,
      })
    : "onbekend";

  return (
    <div>
      <SectionHeader
        eyebrow="Bronnen"
        title="Koppelingen-log"
        description="Token-refresh, OAuth en API-fouten. Bij rood: Weeztix opnieuw koppelen via Bronnen."
        action={
          <Link
            href="/koppelingen"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Naar bronnen
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Fouten (24u)"
          value={String(errorCount)}
          hint="Weeztix + overige koppelingen"
        />
        <MetricCard
          label="Weeztix access"
          value={weeztix.expired ? "Verlopen" : "Geldig"}
          hint={`tot ${accessLabel}`}
        />
        <MetricCard
          label="Refresh token"
          value={weeztix.hasRefresh ? "Aanwezig" : "Ontbreekt"}
          hint={weeztix.source === "database" ? "in database" : "alleen env"}
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-1">
        {(
          [
            { href: "/dashboard/logs", label: "Alles" },
            { href: "/dashboard/logs?level=error", label: "Alleen fouten" },
            { href: "/dashboard/logs?source=weeztix", label: "Weeztix" },
          ] as const
        ).map((f) => {
          const active =
            (f.label === "Alles" && !level && !source) ||
            (f.label === "Alleen fouten" && level === "error" && !source) ||
            (f.label === "Weeztix" && source === "weeztix" && !level);
          return (
            <Link
              key={f.href}
              href={f.href}
              className={
                active
                  ? "bg-accent px-3 py-1.5 text-sm text-accent-contrast"
                  : "px-3 py-1.5 text-sm text-text-muted hover:text-text"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {logs.length === 0 ? (
        <p className="border border-border bg-surface px-4 py-8 text-sm text-text-muted">
          Nog geen logregels. Token-refresh en fouten verschijnen hier automatisch.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border bg-surface">
          {logs.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={row.level === "error" ? "danger" : "success"}
                >
                  {row.level === "error" ? "Fout" : "Info"}
                </StatusBadge>
                <span className="font-mono text-[11px] text-text-dim">
                  {row.source} · {row.event}
                </span>
                <span className="ml-auto text-[11px] text-text-dim">
                  {format(row.createdAt, "d MMM yyyy · HH:mm:ss", {
                    locale: nl,
                  })}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-text">{row.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
