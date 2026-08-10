"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PipelineStage } from "@/lib/outreach/pipeline";
import { PROSPECT_SOURCES } from "@/lib/outreach/sources";

type DryRunResult = {
  ranAt: string;
  steps: {
    stage: string;
    ok: boolean;
    summary: string;
    sample?: unknown;
  }[];
};

const statusTone = {
  ready_mock: "success" as const,
  needs_credentials: "danger" as const,
  partial: "warn" as const,
};

const statusLabel = {
  ready_mock: "Mock klaar",
  needs_credentials: "Credentials nodig",
  partial: "Gedeeltelijk",
};

export function OutreachPipelinePanel() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/outreach/pipeline/dry-run")
      .then((r) => r.json())
      .then((d) => setStages(d.stages))
      .catch(() => setError("Pipeline-stappen laden mislukt"));
  }, []);

  function runDryRun() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/outreach/pipeline/dry-run", {
          method: "POST",
        });
        const data = await res.json();
        setDryRun(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Dry-run mislukt");
      }
    });
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Volgende stap"
        title="Data-pipeline"
        description="Zo komt outreach-data binnen: ontdekken (meerdere bronnen) → verrijken → filteren → genereren → versturen → meten → lead routen."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/koppelingen"
              className="border border-border px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Koppelingen
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={runDryRun}
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
            >
              {pending ? "Draait…" : "Dry-run starten"}
            </button>
          </div>
        }
      />

      {error && (
        <p className="mb-4 border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ol className="space-y-3">
        {stages.map((stage) => (
          <li key={stage.id} className="border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl tracking-[0.06em]">
                {stage.name}
              </h2>
              <StatusBadge tone={statusTone[stage.status]}>
                {statusLabel[stage.status]}
              </StatusBadge>
            </div>
            <p className="mt-2 text-sm text-text-muted">{stage.description}</p>
            <p className="mt-2 text-xs text-text-dim">Bron: {stage.dataSource}</p>
            {stage.missing && stage.missing.length > 0 && (
              <p className="mt-1 font-mono text-xs text-danger">
                Nog nodig: {stage.missing.join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ol>

      {dryRun && (
        <section className="mt-8 border border-border bg-surface p-4">
          <h2 className="font-display text-2xl tracking-[0.06em]">
            Dry-run resultaat
          </h2>
          <p className="mt-1 text-xs text-text-dim">
            {new Date(dryRun.ranAt).toLocaleString("nl-NL")}
          </p>
          <ul className="mt-4 space-y-3">
            {dryRun.steps.map((step) => (
              <li
                key={step.stage}
                className="border border-border bg-bg px-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge tone={step.ok ? "success" : "warn"}>
                    {step.stage}
                  </StatusBadge>
                  <span className="text-sm text-text-muted">{step.summary}</span>
                </div>
                {step.sample != null && (
                  <pre className="mt-2 overflow-x-auto bg-surface p-2 font-mono text-[11px] text-text-dim">
                    {JSON.stringify(step.sample, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 border border-border bg-surface p-4">
        <h2 className="font-display text-xl tracking-[0.06em]">
          Bronnen in scope
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {PROSPECT_SOURCES.map((s) => (
            <li
              key={s.id}
              className="border border-border bg-bg px-3 py-2 text-sm text-text-muted"
            >
              <span className="font-display tracking-[0.06em] text-text">
                {s.name}
              </span>
              <span className="text-text-dim"> · {s.status}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-text-muted">
          Voorstel: starten met <strong className="text-text">bureau-import + CRM-uitsluitingen + website-scrape</strong>,
          parallel KvK aanvragen. Enrichment/Places alleen als KvK te traag of te duur blijkt.
        </p>
      </section>
    </div>
  );
}
