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
  status: "missing" | "configured" | "verified" | "error" | "manual" | "on_hold";
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
  on_hold: "On hold",
};

const SECTIONS: Array<{
  id: "dashboard" | "outreach" | "shared";
  title: string;
  description: string;
}> = [
  {
    id: "dashboard",
    title: "Event-dashboard",
    description:
      "Weeztix is de primaire ticketbron. Daarnaast RA, TicketSwap, marketing, weer en alerts.",
  },
  {
    id: "outreach",
    title: "Outreach",
    description:
      "Prospectbronnen en sales-notificaties — nodig voor het bedrijfsevent-outreach.",
  },
  {
    id: "shared",
    title: "Beide tools",
    description:
      "Login, database, e-mail en AI — gedeelde basis voor dashboard en outreach.",
  },
];

export function IntegrationsHub() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [rows, setRows] = useState<StatusRow[]>([]);
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

  function runWeeztixSync() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/integrations/weeztix/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "events" }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          eventsFetched?: number;
          editionsUpserted?: number;
          inventoryUpserted?: number;
        };
        if (!res.ok || data.ok === false) {
          throw new Error(data.error ?? "Weeztix sync mislukt");
        }
        setRows((prev) =>
          prev.map((row) =>
            row.id === "weeztix"
              ? {
                  ...row,
                  status: "verified",
                  message: `${data.eventsFetched ?? 0} events · ${data.editionsUpserted ?? 0} edities · ${data.inventoryUpserted ?? 0} voorraad`,
                }
              : row,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Weeztix sync mislukt");
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
          mismatches?: number;
          venue?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "RA sync mislukt");
        }
        const mismatchBit =
          (data.mismatches ?? 0) > 0
            ? ` · ${data.mismatches} Weeztix-uitverkocht/RA-open`
            : "";
        setRows((prev) =>
          prev.map((row) =>
            row.id === "resident_advisor"
              ? {
                  ...row,
                  status: "verified",
                  message: `${data.venue ?? "RA"} · ${data.upserted ?? 0} listings · ${data.linked ?? 0} gekoppeld${mismatchBit}`,
                }
              : row,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "RA sync mislukt");
      }
    });
  }

  function runAlertTest() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/integrations/alerts/test-email", {
          method: "POST",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          to?: string[];
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Testmail mislukt");
        }
        setRows((prev) =>
          prev.map((row) =>
            row.id === "alert_notify"
              ? {
                  ...row,
                  status: "verified",
                  message: `Testmail verstuurd naar ${(data.to ?? []).join(", ")}`,
                }
              : row,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Testmail mislukt");
      }
    });
  }

  function runTicketswapSync() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/integrations/ticketswap/sync", {
          method: "POST",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          upserted?: number;
          linked?: number;
          mismatches?: number;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "TicketSwap sync mislukt");
        }
        setRows((prev) =>
          prev.map((row) =>
            row.id === "ticketswap"
              ? {
                  ...row,
                  status: "verified",
                  message: `${data.upserted ?? 0} listings · ${data.linked ?? 0} gekoppeld · ${data.mismatches ?? 0} sold-out alerts`,
                }
              : row,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "TicketSwap sync mislukt");
      }
    });
  }

  const grouped = useMemo(() => {
    const byTool = {
      dashboard: rows
        .filter((r) => r.tool === "dashboard")
        .sort((a, b) => Number(b.id === "weeztix") - Number(a.id === "weeztix")),
      outreach: rows.filter((r) => r.tool === "outreach"),
      shared: rows.filter((r) => r.tool === "shared"),
    };
    return byTool;
  }, [rows]);

  const counts = useMemo(
    () => ({
      ok: rows.filter((r) => r.status === "verified").length,
      missing: rows.filter((r) => r.status === "missing").length,
      error: rows.filter((r) => r.status === "error").length,
    }),
    [rows],
  );

  return (
    <div>
      <SectionHeader
        eyebrow="Koppelingen"
        title="Bronnen"
        description="API’s per tool. Groen = live getest. We lezen alleen."
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

      <div className="space-y-10">
        {SECTIONS.map((section) => {
          const items = grouped[section.id];
          if (items.length === 0) return null;
          const active = items.filter((r) => r.status !== "on_hold");
          const ok = active.filter((r) => r.status === "verified").length;
          return (
            <section key={section.id} aria-labelledby={`bronnen-${section.id}`}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2
                    id={`bronnen-${section.id}`}
                    className="font-display text-xl tracking-[0.03em] text-text"
                  >
                    {section.title}
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-text-muted">
                    {section.description}
                  </p>
                </div>
                <p className="text-xs text-text-dim">
                  {ok}/{active.length} werkt
                </p>
              </div>
              <div className="space-y-2">
                {items.map((row) => (
                  <IntegrationCard
                    key={row.id}
                    row={row}
                    meta={catalog.find((c) => c.id === row.id)}
                    pending={pending}
                    onVerify={() => runVerify(row.id)}
                    onWeeztixSync={runWeeztixSync}
                    onRaSync={runRaSync}
                    onTicketswapSync={runTicketswapSync}
                    onAlertTest={runAlertTest}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-text-muted">
        Dashboard-bronnen voeden Insights.{" "}
        <Link href="/dashboard/insights" className="underline hover:text-text">
          Naar Insights →
        </Link>
        {" · "}
        <Link href="/outreach" className="underline hover:text-text">
          Naar Outreach →
        </Link>
      </p>
    </div>
  );
}

function IntegrationCard({
  row,
  meta,
  pending,
  onVerify,
  onWeeztixSync,
  onRaSync,
  onTicketswapSync,
  onAlertTest,
}: {
  row: StatusRow;
  meta?: CatalogItem;
  pending: boolean;
  onVerify: () => void;
  onWeeztixSync: () => void;
  onRaSync: () => void;
  onTicketswapSync: () => void;
  onAlertTest: () => void;
}) {
  const isOk = row.status === "verified";
  const isHold = row.status === "on_hold";
  return (
    <article
      className={cn(
        "border border-border bg-surface p-4",
        isOk && "integration-ok",
        row.status === "error" && "border-danger/50",
        isHold && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium text-text">{row.name}</h3>
            <StatusBadge
              tone={
                isOk
                  ? "success"
                  : row.status === "error" || row.status === "missing"
                    ? "danger"
                    : isHold
                      ? "warn"
                      : "neutral"
              }
              pulse={isOk}
            >
              {statusLabel[row.status]}
            </StatusBadge>
          </div>
          <p className="mt-1.5 text-sm text-text-muted">{meta?.description}</p>
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
          {!isHold && (
            <button
              type="button"
              disabled={pending}
              onClick={onVerify}
              className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              Test
            </button>
          )}
          {row.id === "weeztix" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={onWeeztixSync}
                className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
              >
                Sync events
              </button>
              <a
                href="/api/integrations/weeztix/oauth/start"
                className="border border-border px-3 py-1.5 text-sm hover:border-text"
              >
                Opnieuw koppelen
              </a>
            </>
          )}
          {row.id === "resident_advisor" && (
            <button
              type="button"
              disabled={pending}
              onClick={onRaSync}
              className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              Sync listings
            </button>
          )}
          {row.id === "ticketswap" && (
            <button
              type="button"
              disabled={pending}
              onClick={onTicketswapSync}
              className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              Sync listings
            </button>
          )}
          {row.id === "alert_notify" && (
            <button
              type="button"
              disabled={pending}
              onClick={onAlertTest}
              className="border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              Stuur testmail
            </button>
          )}
        </div>
      </div>

      {meta && row.status !== "verified" && !isHold && (
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
            {row.id === "ai"
              ? [...meta.envKeys, ...(meta.optionalEnvKeys ?? [])].join(" · ")
              : meta.envKeys.join(" · ")}
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
