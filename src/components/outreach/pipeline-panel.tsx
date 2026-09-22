"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PipelineStage } from "@/lib/outreach/pipeline";

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
  ready: "success" as const,
  blocked: "danger" as const,
  partial: "info" as const,
};

const statusLabel = {
  ready: "Klaar",
  blocked: "Blokkeert",
  partial: "Deels klaar",
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
        const stagesRes = await fetch("/api/outreach/pipeline/dry-run");
        const stagesData = await stagesRes.json();
        setStages(stagesData.stages ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Dry-run mislukt");
      }
    });
  }

  const blocked = stages.filter((s) => s.status === "blocked").length;

  return (
    <div>
      <SectionHeader
        eyebrow="Systeem"
        title="Pipeline"
        description="Status van de keten: ophalen → verrijken → mailen → meten. Rood alleen als iets écht blokkeert."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={blocked ? "danger" : "success"}>
              {blocked ? `${blocked} blokkeert` : "Geen blockers"}
            </StatusBadge>
            <Link
              href="/outreach/lijst-bijwerken"
              className="border border-border px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Lijst bijwerken →
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={runDryRun}
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
            >
              {pending ? "Draait…" : "Check opnieuw"}
            </button>
          </div>
        }
      />

      {error && (
        <p className="mb-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <ol className="divide-y divide-border border-y border-border">
        {stages.map((stage) => (
          <li key={stage.id} className="py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg tracking-[0.06em]">
                {stage.name}
              </h2>
              <StatusBadge tone={statusTone[stage.status]}>
                {statusLabel[stage.status]}
              </StatusBadge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">
              {stage.description}
            </p>
            {stage.missing && stage.missing.length > 0 ? (
              <p className="mt-1 text-xs text-text-dim">
                {stage.status === "blocked" ? "Nodig: " : "Optioneel / bewust: "}
                {stage.missing.join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {dryRun ? (
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-display text-lg tracking-[0.06em]">
            Laatste check
          </h2>
          <p className="mt-1 text-xs text-text-dim">
            {new Date(dryRun.ranAt).toLocaleString("nl-NL")}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {dryRun.steps.map((step) => (
              <li key={step.stage} className="flex gap-2">
                <StatusBadge tone={step.ok ? "success" : "danger"}>
                  {step.stage}
                </StatusBadge>
                <span className="text-text-muted">{step.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
