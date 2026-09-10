"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  BATCH_PRESETS,
  estimateBatch,
  formatEurFromCents,
  type BatchCostInput,
} from "@/lib/outreach/batch-costs";

const SIZES = [25, 100, 350, 450] as const;

function payerLabel(payer: "client" | "studio" | "gratis") {
  if (payer === "client") return "hun factuur";
  if (payer === "studio") return "onze stack";
  return "gratis";
}

function payerTone(payer: "client" | "studio" | "gratis") {
  if (payer === "client") return "accent" as const;
  if (payer === "studio") return "info" as const;
  return "neutral" as const;
}

export function BatchCostPlanner() {
  const [input, setInput] = useState<BatchCostInput>({
    companies: 25,
    includeKvk: true,
    hunterShare: 0.5,
    includePeople: false,
  });

  const estimate = useMemo(() => estimateBatch(input), [input]);

  function applyPreset(next: BatchCostInput) {
    setInput(next);
  }

  return (
    <section className="mb-8 border border-accent/40 bg-surface p-4">
      <h2 className="font-display text-2xl tracking-[0.06em]">
        Wat kost een rits?
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-text-muted">
        Schatting voordat je op Lijst vullen klikt. Apollo is 1 credit per
        pagina (nu 100 bedrijven). KvK landt op hun account. Hunter alleen als
        de site geen events@ heeft.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BATCH_PRESETS.map((preset) => {
          const row = estimateBatch(preset.input);
          const active =
            input.companies === preset.input.companies &&
            input.includeKvk === preset.input.includeKvk &&
            input.hunterShare === preset.input.hunterShare &&
            input.includePeople === preset.input.includePeople;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.input)}
              className={`border p-3 text-left ${
                active
                  ? "border-accent bg-accent-soft/40"
                  : "border-border bg-bg hover:border-accent"
              }`}
            >
              <p className="font-display text-sm tracking-[0.1em] text-text">
                {preset.label}
              </p>
              <p className="mt-1 text-xs text-text-muted">{preset.hint}</p>
              <p className="mt-3 font-display text-2xl tracking-wide">
                {formatEurFromCents(row.totalCents)}
              </p>
              <p className="mt-1 text-xs text-text-dim">
                {formatEurFromCents(row.perCompanyCents)} / bedrijf
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-[0.12em] text-text-dim">
              Aantal bedrijven
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInput((cur) => ({ ...cur, companies: n }))}
                  className={`border px-3 py-1.5 font-display text-sm tracking-[0.08em] ${
                    input.companies === n
                      ? "border-accent bg-accent text-accent-contrast"
                      : "border-border bg-bg text-text hover:border-accent"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 border border-border bg-bg p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={input.includeKvk}
                onChange={(e) =>
                  setInput((cur) => ({ ...cur, includeKvk: e.target.checked }))
                }
              />
              <span>
                <span className="font-medium text-text">KvK-verrijking</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Nummer, jubileum, vestiging · hun credits
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 border border-border bg-bg p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={input.includePeople}
                onChange={(e) =>
                  setInput((cur) => ({
                    ...cur,
                    includePeople: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium text-text">Contactpersonen</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Apollo people · 1 credit / bedrijf
                </span>
              </span>
            </label>
          </div>

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-[0.12em] text-text-dim">
              Hunter als de site leeg is
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  [0, "Uit"],
                  [0.5, "Helft"],
                  [1, "Alle"],
                ] as const
              ).map(([share, label]) => (
                <button
                  key={share}
                  type="button"
                  onClick={() =>
                    setInput((cur) => ({ ...cur, hunterShare: share }))
                  }
                  className={`border px-3 py-1.5 text-sm ${
                    input.hunterShare === share
                      ? "border-accent bg-accent text-accent-contrast"
                      : "border-border bg-bg text-text hover:border-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className="border border-border bg-bg p-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-dim">
            Deze rits
          </p>
          <p className="mt-2 font-display text-4xl tracking-wide">
            {formatEurFromCents(estimate.totalCents)}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {formatEurFromCents(estimate.perCompanyCents)} per bedrijf
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex justify-between gap-2">
              <span className="text-text-muted">Hun KvK-account</span>
              <span className="font-display tracking-wide">
                {formatEurFromCents(estimate.clientCents)}
              </span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-text-muted">Onze stack</span>
              <span className="font-display tracking-wide">
                {formatEurFromCents(estimate.studioCents)}
              </span>
            </li>
          </ul>
        </aside>
      </div>

      <ul className="mt-5 divide-y divide-border border-t border-border">
        {estimate.lines.map((line) => (
          <li
            key={line.id}
            className="flex flex-wrap items-start justify-between gap-3 py-3"
          >
            <div>
              <p className="text-sm text-text">{line.label}</p>
              <p className="mt-0.5 text-xs text-text-muted">{line.detail}</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge tone={payerTone(line.payer)}>
                {payerLabel(line.payer)}
              </StatusBadge>
              <p className="w-20 text-right font-display text-sm tracking-wide">
                {line.cents === 0 ? "€ 0,00" : formatEurFromCents(line.cents)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
