"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  askFromClient: string[];
};

type MeetingInput = {
  id: string;
  tool: string;
  title: string;
  detail: string;
  ownerHint: string;
};

type VerifyResult = {
  id: string;
  name: string;
  status: StatusRow["status"];
  message: string;
  checkedAt: string;
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
  const [meeting, setMeeting] = useState<MeetingInput[]>([]);
  const [verifyMap, setVerifyMap] = useState<Record<string, VerifyResult>>({});
  const [filter, setFilter] = useState<"all" | "dashboard" | "outreach" | "shared">(
    "all",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/integrations/status");
    if (!res.ok) throw new Error("Status laden mislukt");
    const data = await res.json();
    setCatalog(data.catalog);
    setRows(data.integrations);
    setMeeting(data.meetingInputs);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Error"));
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
        const next: Record<string, VerifyResult> = { ...verifyMap };
        for (const r of data.results as VerifyResult[]) {
          next[r.id] = r;
        }
        setVerifyMap(next);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verify mislukt");
      }
    });
  }

  const visible = rows.filter(
    (r) => filter === "all" || r.tool === filter,
  );

  const counts = {
    missing: rows.filter((r) => r.status === "missing").length,
    configured: rows.filter((r) => r.status === "configured").length,
    verified: Object.values(verifyMap).filter((v) => v.status === "verified")
      .length,
  };

  return (
    <div>
      <SectionHeader
        eyebrow="Meeting-ready"
        title="Koppelingen"
        description="Overzicht van alle API’s en inputs. Zet keys in .env.local en verifieer hier — klaar voor het gesprek morgen."
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

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Ontbreekt" value={String(counts.missing)} />
        <Stat label="Geconfigureerd" value={String(counts.configured)} />
        <Stat label="Geverifieerd (deze sessie)" value={String(counts.verified)} />
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
            {f === "all" ? "Alles" : f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((row) => {
          const meta = catalog.find((c) => c.id === row.id);
          const verified = verifyMap[row.id];
          const status = verified?.status ?? row.status;
          return (
            <article
              key={row.id}
              className="border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl tracking-[0.06em]">
                      {row.name}
                    </h2>
                    <StatusBadge tone={toneMap[status]}>{status}</StatusBadge>
                    <StatusBadge tone="neutral">{row.tool}</StatusBadge>
                    <StatusBadge
                      tone={
                        row.priority === "critical"
                          ? "danger"
                          : row.priority === "high"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {row.priority}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">
                    {meta?.description}
                  </p>
                  {verified && (
                    <p className="mt-2 text-xs text-text-dim">
                      Verify: {verified.message}
                    </p>
                  )}
                  {row.missing.length > 0 && (
                    <p className="mt-1 font-mono text-xs text-danger">
                      Env: {row.missing.join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runVerify(row.id)}
                  className="border border-border px-3 py-1.5 font-display text-sm tracking-[0.1em] hover:border-accent disabled:opacity-50"
                >
                  Verify
                </button>
              </div>

              {meta && (
                <div className="mt-4 grid gap-3 border-t border-border pt-3 lg:grid-cols-2">
                  <div>
                    <p className="font-display text-xs tracking-[0.14em] text-text-dim">
                      Vragen aan Thuishaven
                    </p>
                    <ul className="mt-1 list-inside list-disc text-sm text-text-muted">
                      {meta.askFromClient.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-display text-xs tracking-[0.14em] text-text-dim">
                      Verify pad
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      {meta.verifyHint}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-text-dim">
                      {meta.envKeys.join(" · ")}
                      {meta.optionalEnvKeys.length
                        ? ` · (opt) ${meta.optionalEnvKeys.join(", ")}`
                        : ""}
                    </p>
                    {meta.docsUrl && (
                      <a
                        href={meta.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-accent hover:underline"
                      >
                        Docs →
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
        <h2 className="font-display text-2xl tracking-[0.06em]">
          Extra inputs voor morgen
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Geen API-keys, wel nodig om pipelines goed te zetten.
        </p>
        <ul className="mt-4 space-y-3">
          {meeting.map((item) => (
            <li
              key={item.id}
              className="border border-border bg-bg px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-lg tracking-[0.06em]">
                  {item.title}
                </p>
                <StatusBadge tone="neutral">{item.tool}</StatusBadge>
                <span className="text-xs text-text-dim">{item.ownerHint}</span>
              </div>
              <p className="mt-1 text-sm text-text-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
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
