"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Loader2,
} from "lucide-react";
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

/** In-flight Bronnen action on a specific source. */
type ActiveJob = {
  sourceId: string;
  label: string;
  startedAt: number;
};

type JobResult = {
  sourceId: string;
  ok: boolean;
  message: string;
  at: number;
};

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatClock(at: number): string {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(at);
}

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
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probed, setProbed] = useState(false);
  const busy = pending || job != null;

  async function runSourceJob(
    sourceId: string,
    label: string,
    run: (signal: AbortSignal) => Promise<{
      okMessage: string;
      patch?: Partial<StatusRow>;
    }>,
    /** Soft ceiling so the UI never spins forever (RA can be slow). */
    timeoutMs = 90_000,
  ) {
    if (job) return;
    setError(null);
    setJobResult(null);
    setJob({ sourceId, label, startedAt: Date.now() });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { okMessage, patch } = await run(controller.signal);
      if (patch) {
        setRows((prev) =>
          prev.map((row) =>
            row.id === sourceId ? { ...row, ...patch } : row,
          ),
        );
      }
      setJobResult({
        sourceId,
        ok: true,
        message: okMessage,
        at: Date.now(),
      });
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      const message = aborted
        ? `${label} duurde te lang (>${Math.round(timeoutMs / 1000)}s). Vernieuw de pagina — de server kan nog bezig zijn of vastzitten.`
        : e instanceof Error
          ? e.message
          : `${label} mislukt`;
      setError(message);
      setJobResult({
        sourceId,
        ok: false,
        message,
        at: Date.now(),
      });
    } finally {
      window.clearTimeout(timer);
      setJob(null);
    }
  }

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
    void runSourceJob("weeztix", "Sync events", async (signal) => {
      const res = await fetch("/api/integrations/weeztix/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "events" }),
        signal,
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
      const okMessage = `${data.eventsFetched ?? 0} events · ${data.editionsUpserted ?? 0} edities · ${data.inventoryUpserted ?? 0} voorraad`;
      return {
        okMessage,
        patch: { status: "verified" as const, message: okMessage },
      };
    });
  }

  function runRaSync() {
    void runSourceJob(
      "resident_advisor",
      "Sync listings",
      async (signal) => {
        const res = await fetch("/api/integrations/ra/sync", {
          method: "POST",
          signal,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          upserted?: number;
          linked?: number;
          mismatches?: number;
          venue?: string;
          areaFetched?: number;
          areaUpserted?: number;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "RA sync mislukt");
        }
        const mismatchBit =
          (data.mismatches ?? 0) > 0
            ? ` · ${data.mismatches} Weeztix-uitverkocht/RA-open`
            : "";
        const areaBit =
          data.areaUpserted != null
            ? ` · AMS ${data.areaUpserted}/${data.areaFetched ?? 0} concurrenten`
            : "";
        const okMessage = `${data.venue ?? "RA"} · ${data.upserted ?? 0} listings · ${data.linked ?? 0} gekoppeld${areaBit}${mismatchBit}`;
        return {
          okMessage,
          patch: { status: "verified" as const, message: okMessage },
        };
      },
      4 * 60 * 1000,
    );
  }

  function runAlertTest() {
    void runSourceJob("alert_notify", "Testmail", async (signal) => {
      const res = await fetch("/api/integrations/alerts/test-email", {
        method: "POST",
        signal,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        to?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Testmail mislukt");
      }
      const okMessage = `Testmail verstuurd naar ${(data.to ?? []).join(", ")}`;
      return {
        okMessage,
        patch: { status: "verified" as const, message: okMessage },
      };
    });
  }

  function runTicketswapSync() {
    void runSourceJob("ticketswap", "Sync listings", async (signal) => {
      const res = await fetch("/api/integrations/ticketswap/sync", {
        method: "POST",
        signal,
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
      const okMessage = `${data.upserted ?? 0} listings · ${data.linked ?? 0} gekoppeld · ${data.mismatches ?? 0} sold-out alerts`;
      return {
        okMessage,
        patch: { status: "verified" as const, message: okMessage },
      };
    });
  }

  function runInstagramSync() {
    void runSourceJob(
      "instagram",
      "Sync posts",
      async (signal) => {
        const res = await fetch("/api/integrations/instagram/sync", {
          method: "POST",
          signal,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          fetched?: number;
          upserted?: number;
          blobStored?: number;
          insightsOk?: number;
          analyzed?: number;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Instagram sync mislukt");
        }
        const okMessage = `${data.upserted ?? 0}/${data.fetched ?? 0} posts · ${data.blobStored ?? 0} blob · ${data.insightsOk ?? 0} insights · ${data.analyzed ?? 0} vision`;
        return {
          okMessage,
          patch: { status: "verified" as const, message: okMessage },
        };
      },
      3 * 60 * 1000,
    );
  }

  function runInstagramAnalyze() {
    void runSourceJob(
      "instagram",
      "Analyseer",
      async (signal) => {
        const res = await fetch("/api/integrations/instagram/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 8 }),
          signal,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          attempted?: number;
          analyzed?: number;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Vision-analyse mislukt");
        }
        const okMessage = `Vision: ${data.analyzed ?? 0}/${data.attempted ?? 0} posts geanalyseerd`;
        return {
          okMessage,
          patch: { status: "verified" as const, message: okMessage },
        };
      },
      3 * 60 * 1000,
    );
  }

  function runYouTubeSync() {
    void runSourceJob(
      "youtube",
      "Sync videos",
      async (signal) => {
        const res = await fetch("/api/integrations/youtube/sync", {
          method: "POST",
          signal,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          fetched?: number;
          upserted?: number;
          blobStored?: number;
          analyzed?: number;
          channelTitle?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "YouTube sync mislukt");
        }
        const okMessage = `${data.upserted ?? 0}/${data.fetched ?? 0} video's · ${data.analyzed ?? 0} vision${data.channelTitle ? ` · ${data.channelTitle}` : ""}`;
        return {
          okMessage,
          patch: { status: "verified" as const, message: okMessage },
        };
      },
      3 * 60 * 1000,
    );
  }

  function runTikTokSync() {
    void runSourceJob(
      "tiktok",
      "Sync videos",
      async (signal) => {
        const res = await fetch("/api/integrations/tiktok/sync", {
          method: "POST",
          signal,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          fetched?: number;
          upserted?: number;
          blobStored?: number;
          analyzed?: number;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "TikTok sync mislukt");
        }
        const okMessage = `${data.upserted ?? 0}/${data.fetched ?? 0} video's · ${data.blobStored ?? 0} blob · ${data.analyzed ?? 0} vision`;
        return {
          okMessage,
          patch: { status: "verified" as const, message: okMessage },
        };
      },
      3 * 60 * 1000,
    );
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
              disabled={busy}
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

      {job && (
        <p
          className="mb-4 flex items-center gap-2 border border-border bg-surface px-3 py-2 text-sm text-text"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 shrink-0 animate-spin text-text-muted" />
          <span>
            <span className="font-medium">{job.label}</span>
            {" · "}
            {rows.find((r) => r.id === job.sourceId)?.name ?? job.sourceId}
            {" · "}
            <JobElapsed startedAt={job.startedAt} />
            {job.sourceId === "resident_advisor" && (
              <span className="text-text-dim">
                {" "}
                — AMS-concurrenten kunnen 1–2 min duren
              </span>
            )}
          </span>
        </p>
      )}

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
                    busy={busy}
                    job={job?.sourceId === row.id ? job : null}
                    jobResult={
                      jobResult?.sourceId === row.id ? jobResult : null
                    }
                    onVerify={() => runVerify(row.id)}
                    onWeeztixSync={runWeeztixSync}
                    onRaSync={runRaSync}
                    onTicketswapSync={runTicketswapSync}
                    onInstagramSync={runInstagramSync}
                    onInstagramAnalyze={runInstagramAnalyze}
                    onYouTubeSync={runYouTubeSync}
                    onTikTokSync={runTikTokSync}
                    onAlertTest={runAlertTest}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-text-muted">
        Dashboard-bronnen voeden Dashboards.{" "}
        <Link href="/dashboard/dashboards" className="underline hover:text-text">
          Naar Dashboards →
        </Link>
        {" · "}
        <Link href="/outreach" className="underline hover:text-text">
          Naar Outreach →
        </Link>
      </p>
    </div>
  );
}

function JobElapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-text-muted">
      {formatElapsed(now - startedAt)}
    </span>
  );
}

function IntegrationCard({
  row,
  meta,
  busy,
  job,
  jobResult,
  onVerify,
  onWeeztixSync,
  onRaSync,
  onTicketswapSync,
  onInstagramSync,
  onInstagramAnalyze,
  onYouTubeSync,
  onTikTokSync,
  onAlertTest,
}: {
  row: StatusRow;
  meta?: CatalogItem;
  busy: boolean;
  job: ActiveJob | null;
  jobResult: JobResult | null;
  onVerify: () => void;
  onWeeztixSync: () => void;
  onRaSync: () => void;
  onTicketswapSync: () => void;
  onInstagramSync: () => void;
  onInstagramAnalyze: () => void;
  onYouTubeSync: () => void;
  onTikTokSync: () => void;
  onAlertTest: () => void;
}) {
  const isOk = row.status === "verified";
  const isHold = row.status === "on_hold";
  const isRunning = job != null;
  const showResult =
    jobResult != null &&
    Date.now() - jobResult.at < 5 * 60 * 1000;

  function actionLabel(idle: string): string {
    if (isRunning && job.label === idle) return "Bezig…";
    return idle;
  }

  function isThisAction(idle: string): boolean {
    return isRunning && job.label === idle;
  }

  return (
    <article
      className={cn(
        "border border-border bg-surface p-4",
        isOk && !isRunning && "integration-ok",
        row.status === "error" && "border-danger/50",
        isHold && "opacity-70",
        isRunning && "border-text/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium text-text">{row.name}</h3>
            <StatusBadge
              tone={
                isRunning
                  ? "neutral"
                  : isOk
                    ? "success"
                    : row.status === "error" || row.status === "missing"
                      ? "danger"
                      : isHold
                        ? "warn"
                        : "neutral"
              }
              pulse={isOk && !isRunning}
            >
              {isRunning ? "Bezig" : statusLabel[row.status]}
            </StatusBadge>
          </div>
          <p className="mt-1.5 text-sm text-text-muted">{meta?.description}</p>
          {isRunning && (
            <p
              className="mt-2 flex items-center gap-1.5 text-xs text-text"
              role="status"
            >
              <Loader2 className="size-3.5 animate-spin text-text-muted" />
              <span>
                {job.label} loopt · <JobElapsed startedAt={job.startedAt} />
                {row.id === "resident_advisor" && (
                  <span className="text-text-dim">
                    {" "}
                    (venue + AMS-area)
                  </span>
                )}
              </span>
            </p>
          )}
          {!isRunning && showResult && (
            <p
              className={cn(
                "mt-2 text-xs",
                jobResult.ok ? "text-success" : "text-danger",
              )}
              role="status"
              aria-live="polite"
            >
              {jobResult.ok ? "Klaar" : "Mislukt"} · {jobResult.message}
              <span className="text-text-dim">
                {" "}
                · {formatClock(jobResult.at)}
              </span>
            </p>
          )}
          {!isRunning && !showResult && row.message && (
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
              disabled={busy}
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
                disabled={busy}
                onClick={onWeeztixSync}
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
              >
                {isThisAction("Sync events") && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {actionLabel("Sync events")}
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
              disabled={busy}
              onClick={onRaSync}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              {isThisAction("Sync listings") && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {actionLabel("Sync listings")}
            </button>
          )}
          {row.id === "ticketswap" && (
            <button
              type="button"
              disabled={busy}
              onClick={onTicketswapSync}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              {isThisAction("Sync listings") && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {actionLabel("Sync listings")}
            </button>
          )}
          {row.id === "instagram" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onInstagramSync}
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
              >
                {isThisAction("Sync posts") && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {actionLabel("Sync posts")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onInstagramAnalyze}
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
              >
                {isThisAction("Analyseer") && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {actionLabel("Analyseer")}
              </button>
            </>
          )}
          {row.id === "youtube" && (
            <button
              type="button"
              disabled={busy}
              onClick={onYouTubeSync}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              {isThisAction("Sync videos") && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {actionLabel("Sync videos")}
            </button>
          )}
          {row.id === "tiktok" && (
            <button
              type="button"
              disabled={busy}
              onClick={onTikTokSync}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              {isThisAction("Sync videos") && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {actionLabel("Sync videos")}
            </button>
          )}
          {row.id === "alert_notify" && (
            <button
              type="button"
              disabled={busy}
              onClick={onAlertTest}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm hover:border-text disabled:opacity-50"
            >
              {isThisAction("Stuur testmail") && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {actionLabel("Stuur testmail")}
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
