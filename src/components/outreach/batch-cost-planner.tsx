"use client";

import { useMemo, useState } from "react";
import {
  BATCH_PRESETS,
  estimateBatch,
  formatEurFromCents,
  type BatchCostInput,
} from "@/lib/outreach/batch-costs";

const SIZES = [25, 100, 350, 450] as const;

export function BatchCostPlanner() {
  const [input, setInput] = useState<BatchCostInput>({
    companies: 25,
    includeKvk: true,
    hunterShare: 0.5,
    includePeople: false,
  });

  const estimate = useMemo(() => estimateBatch(input), [input]);

  return (
    <section className="mb-8">
      <h2 className="font-display text-lg tracking-[0.06em]">
        Wat kost een rits?
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Schatting vóór je op Lijst bijwerken klikt.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
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
              onClick={() => setInput(preset.input)}
              className={`border px-3 py-2 text-left text-sm ${
                active
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border hover:border-accent"
              }`}
            >
              <span className="font-display tracking-[0.08em]">
                {preset.label}
              </span>
              <span className="ml-2 text-xs opacity-80">
                {formatEurFromCents(row.totalCents)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="text-xs text-text-dim">
          Aantal
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setInput((cur) => ({ ...cur, companies: n }))}
                className={`border px-2.5 py-1 font-display text-sm tracking-[0.08em] ${
                  input.companies === n
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border hover:border-accent"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={input.includeKvk}
            onChange={(e) =>
              setInput((cur) => ({ ...cur, includeKvk: e.target.checked }))
            }
          />
          KvK
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={input.includePeople}
            onChange={(e) =>
              setInput((cur) => ({ ...cur, includePeople: e.target.checked }))
            }
          />
          Contacten
        </label>
        <label className="text-xs text-text-dim">
          Hunter
          <select
            className="mt-1.5 block border border-border bg-bg px-2 py-1 text-sm text-text"
            value={input.hunterShare}
            onChange={(e) =>
              setInput((cur) => ({
                ...cur,
                hunterShare: Number(e.target.value),
              }))
            }
          >
            <option value={0}>Uit</option>
            <option value={0.5}>Helft</option>
            <option value={1}>Alle</option>
          </select>
        </label>

        <div className="ml-auto text-right">
          <p className="font-display text-3xl tracking-wide">
            {formatEurFromCents(estimate.totalCents)}
          </p>
          <p className="text-xs text-text-dim">
            {formatEurFromCents(estimate.perCompanyCents)}/bedrijf · hun{" "}
            {formatEurFromCents(estimate.clientCents)} · onze{" "}
            {formatEurFromCents(estimate.studioCents)}
          </p>
        </div>
      </div>
    </section>
  );
}
