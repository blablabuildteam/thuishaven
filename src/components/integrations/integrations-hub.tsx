"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

type CatalogItem = {
  id: string;
  name: string;
  tool: string;
  priority: string;
  description: string;
  askFromClient: string[];
  verifyHint: string;
  docsUrl?: string;
  envKeys: string[];
  optionalEnvKeys: string[];
};

type StatusRow = {
  id: string;
  name: string;
  tool: string;
  priority: string;
  status: "missing" | "configured" | "verified" | "error" | "manual";
  missing: string[];
  message?: string;
  checkedAt?: string;
};

const statusLabel: Record<StatusRow["status"], string> = {
  missing: "Ontbreekt",
  configured: "Nog niet getest",
  verified: "Werkt",
  error: "Fout",
  manual: "Handmatig",
};

const toolLabel: Record<string, string> = {
  all: "Alles",
  shared: "Systeem",
  dashboard: "Event-data",
  outreach: "Outreach",
};

export function IntegrationsHub() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [filter, setFilter] = useState<"all" | "dashboard" | "outreach" | "shared">(
    "all",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [probed, setProbed] = useState(false);

  const load = useCallback(async (withProbe: boolean) => {
    const res = await fetch(
      `/api/integrations/status${withProbe ? "?probe=1" : ""}`,
    );
    if (!res.ok) throw new Error("Status laden mislukt");
    const data = await res.json();
    setCatalog(data.catalog);
    setRows(data.integrations);
    setProbed(Boolean(data.probed));
    try {
      localStorage.setItem(
        "th-integrations-status",
        JSON.stringify({
          at: Date.now(),
          integrations: data.integrations,
        }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("th-integrations-status");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          at: number;
          integrations: StatusRow[];
        };
        // Cache max 30 min
        if (Date.now() - parsed.at < 30 * 60 * 1000) {
          setRows(parsed.integrations);
          setProbed(true);
        }
      }
    } catch {
      /* ignore */
    }

    startTransition(async () => {
      try {
        await load(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Onbekende fout");
      }
    });
  }, [load]);

  function runVerify(id?: string) {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/integrations/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(id ? { id } : {}),
        });
        const data = await res.json();
        const byId = Object.fromEntries(
          (data.results as StatusRow[]).map((r) => [r.id, r]),
        );
        setRows((prev) =>
          prev.map((row) => {
            const live = byId[row.id];
            if (!live) return row;
            return {
              ...row,
              status: live.status,
              message: (live as StatusRow & { message?: string }).message,
            };
          }),
        );
        await load(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verificatie mislukt");
      }
    });
  }

  function runRaSync() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/integrations/ra/sync", { method: "POST" });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          upserted?: number;
          linked?: number;
          venue?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "RA sync mislukt");
        }
        setRows((prev) =>
          prev.map((row) =>
            row.id === "resident_advisor"
              ? {
                  ...row,
                  status: "verified",
                  message: `${data.venue ?? "RA"} · ${data.upserted ?? 0} listings · ${data.linked ?? 0} gekoppeld`,
                }
              : row,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "RA sync mislukt");
      }
    });
  }

  const visible = useMemo(
    () => rows.filter((r) => filter === "all" || r.tool === filter),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const scope = filter === "all" ? rows : visible;
    return {
      ok: scope.filter((r) => r.status === "verified").length,
      missing: scope.filter((r) => r.status === "missing").length,
      error: scope.filter((r) => r.status === "error").length,
    };
  }, [rows, visible, filter]);

  return (
    <div>
      <SectionHeader
        eyebrow="Koppelingen"
        title="Bronnen"
        description="API’s die data leveren voor het event-dashboard. Groen = live getest. We lezen alleen."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/logs"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Foutenlog
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => runVerify()}
              className="bg-accent px-3 py-2 text-sm text-accent-contrast disabled:opacity-50"
            >
              {pending ? "Testen…" : "Alles opnieuw testen"}
            </button>
          </div>
        }
      />

      <p className="mb-6 text-sm text-text-muted">
        Filters hieronder zijn alleen voor deze bronnenlijst — niet het event-dashboard.
      </p>
      <div className="mb-8 flex flex-wrap items-center gap-6 text-sm">
        <Count
          icon={<CheckCircle2 className="size-4 text-success" />}
          label="Werkt"
          value={counts.ok}
          emphasize
        />
        <Count
          icon={<CircleDashed className="size-4 text-text-dim" />}
          label="Ontbreekt"
          value={counts.missing}
        />
        <Count
          icon={<CircleAlert className="size-4 text-danger" />}
          label="Fout"
          value={counts.error}
        />
        {probed && (
          <span className="text-xs text-text-dim">Live gecheckt bij laden</span>
        )}
      </div>

      {error && (
        <p className="mb-4 border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-1">
        {(["all", "dashboard", "outreach", "shared"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 text-sm transition-colors",
              filter === f
                ? "bg-accent text-accent-contrast"
                : "text-text-muted hover:text-text",
            )}
          >
            {toolLabel[f]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.map((row) => {
          const meta = catalog.find((c) => c.id === row.id);
          const isOk = row.status === "verified";
          return (
            <article
              key={row.id}
              className={cn(
                "border border-border bg-surface p-4",
                isOk && "integration-ok",
                row.status === "error" && "border-danger/50",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-medium text-text">{row.name}</h2>
                    <StatusBadge
                      tone={
                        isOk
                          ? "success"
                          : row.status === "error" || row.status === "missing"
                            ? "danger"
                            : "neutral"
                      }
                      pulse={isOk}
                    >
                      {statusLabel[row.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-1.5 text-sm text-text-muted">
                    {meta?.description}
                  </p>
                  {row.message && (
                    <p
                      className={cn(
                        "mt-2 text-xs",
                        isOk ? "text-success" : "text-text-dim",
                      )}
                    >
                      {row.message}
                    </p>
                  )}
                  {row.missing.length > 0 && (
                    <p className="mt-1 font-mono text-xs text-danger">
                      Ontbreekt: {row.missing.join(", ")}
                    </p>
                  )}
                </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runVerify(row.id)}
                  className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
                >
                  Test
                </button>
                {row.id === "weeztix" && (
                  <a
                    href="/api/integrations/weeztix/oauth/start"
                    className="border border-border px-3 py-1.5 text-sm hover:border-text"
                  >
                    Opnieuw koppelen
                  </a>
                )}
                {row.id === "resident_advisor" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runRaSync()}
                    className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
                  >
                    Sync listings
                  </button>
                )}
                {row.id === "resident_advisor" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runRaSync()}
                    className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
                  >
                    Sync listings
                  </button>
                )}
              </div>
              </div>

              {meta && row.status !== "verified" && (
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs text-text-dim">
                    Wat is nodig
                  </summary>
                  <ul className="mt-2 list-inside list-disc text-sm text-text-muted">
                    {meta.askFromClient.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="mt-2 font-mono text-[11px] text-text-dim">
                    {meta.envKeys.join(" · ")}
                  </p>
                  {meta.docsUrl && (
                    <a
                      href={meta.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-text underline"
                    >
                      Documentatie
                    </a>
                  )}
                </details>
              )}
            </article>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-text-muted">
        Insights en chat gebruiken deze bronnen.{" "}
        <Link href="/dashboard/insights" className="underline hover:text-text">
          Naar Insights →
        </Link>
      </p>
    </div>
  );
}

function Count({
  icon,
  label,
  value,
  emphasize,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className={cn("text-text-muted", emphasize && "text-text")}>
        {label}
      </span>
      <span
        className={cn(
          "font-display text-xl",
          emphasize && "text-success",
        )}
      >
        {value}
      </span>
    </div>
  );
}
