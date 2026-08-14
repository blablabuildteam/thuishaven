"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { PROSPECT_SOURCES, mockMultiSourceDiscover } from "@/lib/outreach/sources";
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
};

type VerifyResult = {
  id: string;
  name: string;
  status: StatusRow["status"];
  message: string;
};

const statusLabel: Record<StatusRow["status"], string> = {
  missing: "Ontbreekt",
  configured: "Geconfigureerd",
  verified: "Geverifieerd",
  error: "Fout",
  manual: "Handmatig",
};

const priorityLabel: Record<string, string> = {
  critical: "Kritiek",
  high: "Hoog",
  medium: "Middel",
  later: "Later",
};

const toolLabel: Record<string, string> = {
  all: "Alles",
  shared: "Gedeeld",
  dashboard: "Dashboard",
  outreach: "Outreach",
};

const toneMap = {
  missing: "danger" as const,
  configured: "warn" as const,
  verified: "success" as const,
  error: "danger" as const,
  manual: "neutral" as const,
};

export function IntegrationsHub() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [verifyMap, setVerifyMap] = useState<Record<string, VerifyResult>>({});
  const [filter, setFilter] = useState<"all" | "dashboard" | "outreach" | "shared">(
    "all",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const multi = mockMultiSourceDiscover();

  const load = useCallback(async () => {
    const res = await fetch("/api/integrations/status");
    if (!res.ok) throw new Error("Status laden mislukt");
    const data = await res.json();
    setCatalog(data.catalog);
    setRows(data.integrations);
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("th-verify-map");
      if (raw) setVerifyMap(JSON.parse(raw) as Record<string, VerifyResult>);
    } catch {
      /* ignore */
    }
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "Onbekende fout"),
    );
  }, [load]);

  function persistVerify(next: Record<string, VerifyResult>) {
    setVerifyMap(next);
    try {
      sessionStorage.setItem("th-verify-map", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

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
        const next: Record<string, VerifyResult> = { ...verifyMap };
        for (const r of data.results as VerifyResult[]) {
          next[r.id] = r;
        }
        persistVerify(next);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verificatie mislukt");
      }
    });
  }

  const visible = rows.filter((r) => filter === "all" || r.tool === filter);
  const counts = {
    missing: rows.filter((r) => r.status === "missing").length,
    configured: rows.filter((r) => r.status === "configured").length,
    verified: Object.values(verifyMap).filter((v) => v.status === "verified")
      .length,
  };

  return (
    <div>
      <SectionHeader
        eyebrow="Backend"
        title="Koppelingen"
        description="Zet API-keys in .env.local / Vercel. Verifiëren = test-GET. Geverifieerd krijgt een groene rand + badge."
        action={
          <button
            type="button"
            disabled={pending}
            onClick={() => runVerify()}
            className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            {pending ? "Bezig…" : "Alles verifiëren"}
          </button>
        }
      />

      <div className="mb-4 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        <strong className="text-text">Read-only:</strong> we lezen alleen data.
        Klik <em>Verifiëren</em> per koppeling (of Alles verifiëren) — daarna blijft
        de groene status bewaard in deze browsersessie.
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Ontbreekt" value={String(counts.missing)} />
        <Stat label="Geconfigureerd" value={String(counts.configured)} />
        <Stat
          label="Geverifieerd"
          value={String(counts.verified)}
        />
      </div>

      {error && (
        <p className="mb-4 border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-1">
        {(["all", "shared", "dashboard", "outreach"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 font-display text-sm tracking-[0.1em] transition-colors",
              filter === f
                ? "bg-accent text-accent-contrast"
                : "border border-border text-text-muted hover:text-text",
            )}
          >
            {toolLabel[f]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((row) => {
          const meta = catalog.find((c) => c.id === row.id);
          const verified = verifyMap[row.id];
          const status = verified?.status ?? row.status;
          const isVerified = status === "verified";
          return (
            <article
              key={row.id}
              className={cn(
                "border bg-surface p-4 transition-colors",
                status === "error" && "border-2 border-danger/60",
                !isVerified && status !== "error" && "border-border",
              )}
              style={
                isVerified
                  ? {
                      borderWidth: 2,
                      borderColor: "#1f8f4e",
                      boxShadow: "inset 5px 0 0 0 #1f8f4e",
                    }
                  : undefined
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl tracking-[0.06em]">
                      {row.name}
                    </h2>
                    <StatusBadge tone={toneMap[status]}>
                      {statusLabel[status]}
                    </StatusBadge>
                    <StatusBadge tone="neutral">
                      {toolLabel[row.tool] ?? row.tool}
                    </StatusBadge>
                    <StatusBadge
                      tone={
                        row.priority === "critical"
                          ? "danger"
                          : row.priority === "high"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {priorityLabel[row.priority] ?? row.priority}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">
                    {meta?.description}
                  </p>
                  {verified && (
                    <p className="mt-2 text-xs text-text-dim">
                      Resultaat: {verified.message}
                    </p>
                  )}
                  {row.missing.length > 0 && (
                    <p className="mt-1 font-mono text-xs text-danger">
                      Ontbrekende env: {row.missing.join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runVerify(row.id)}
                  className="border border-border px-3 py-1.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
                >
                  Verifiëren
                </button>
              </div>

              {meta && (
                <div className="mt-4 grid gap-3 border-t border-border pt-3 lg:grid-cols-2">
                  <div>
                    <p className="font-display text-xs tracking-[0.14em] text-text-dim">
                      Nodig van Thuishaven
                    </p>
                    <ul className="mt-1 list-inside list-disc text-sm text-text-muted">
                      {meta.askFromClient.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-display text-xs tracking-[0.14em] text-text-dim">
                      Verificatiepad
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      {meta.verifyHint}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-text-dim">
                      {meta.envKeys.join(" · ")}
                      {meta.optionalEnvKeys.length
                        ? ` · (optioneel) ${meta.optionalEnvKeys.join(", ")}`
                        : ""}
                    </p>
                    {meta.docsUrl && (
                      <a
                        href={meta.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-accent hover:underline"
                      >
                        Documentatie →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="mt-10 border border-border bg-surface p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl tracking-[0.06em]">
              Prospectbronnen (naast KvK)
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Multi-source ontdekking + dedupe. Dry-run merge:{" "}
              {multi.merged.length} unieke bedrijven,{" "}
              {multi.duplicatesRemoved} duplicaten samengevoegd.
            </p>
          </div>
          <Link
            href="/outreach/pipeline"
            className="border border-border px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
          >
            Pipeline →
          </Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {PROSPECT_SOURCES.map((src) => (
            <article
              key={src.id}
              className="border border-border bg-bg p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg tracking-[0.06em]">
                  {src.name}
                </h3>
                <StatusBadge
                  tone={
                    src.status === "ingebouwd"
                      ? "success"
                      : src.status === "gepland"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {src.status}
                </StatusBadge>
                <StatusBadge tone="neutral">kosten {src.cost}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-text-muted">{src.description}</p>
              <p className="mt-2 text-xs text-text-dim">{src.legalNote}</p>
              <p className="mt-3 font-display text-xs tracking-[0.14em] text-text-dim">
                Vragen voor het gesprek
              </p>
              <ul className="mt-1 list-inside list-disc text-sm text-text-muted">
                {src.meetingQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-surface p-4">
      <p className="font-display text-sm tracking-[0.14em] text-text-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl">{value}</p>
    </div>
  );
}
