"use client";

import { useId, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import {
  djFeesCsv,
  formatDjFeeSpend,
  monthKeyFromDay,
  monthLabelFromDay,
  type DjFeeEventView,
} from "@/lib/dashboard/dj-fee-ranges";
import { displayEditionName } from "@/lib/editions/lineup";
import { formatTicketSheetDate } from "@/lib/time/amsterdam";
import { cn } from "@/lib/utils";

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportFilename(events: DjFeeEventView[]): string {
  const days = events.map((e) => e.day).sort();
  const first = days[0]!;
  const last = days[days.length - 1]!;
  return first === last ? `dj-fees-${first}.csv` : `dj-fees-${first}-tot-${last}.csv`;
}

/** Pick events (per month or one by one) and download their DJ-fees as CSV. */
export function DjFeesExport({
  events,
  initialMonth,
}: {
  events: DjFeeEventView[];
  initialMonth: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const titleId = useId();

  const months = useMemo(() => {
    const map = new Map<string, DjFeeEventView[]>();
    for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const key = monthKeyFromDay(event.day);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => ({ key, label: monthLabelFromDay(list[0]!.day), events: list }));
  }, [events]);

  const picked = events.filter((e) => selected.has(e.id));
  const pickedDjs = picked.reduce((sum, e) => sum + e.artists.length, 0);

  function openPicker() {
    setSelected(
      new Set(events.filter((e) => monthKeyFromDay(e.day) === initialMonth).map((e) => e.id)),
    );
    setOpen(true);
  }

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function onDownload() {
    if (picked.length === 0) return;
    downloadCsv(exportFilename(picked), djFeesCsv(picked, displayEditionName));
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={events.length === 0}
        className="inline-flex shrink-0 items-center gap-2 border border-border bg-surface px-3 py-2.5 text-sm hover:bg-surface-hover disabled:opacity-50"
      >
        <Download className="size-4" aria-hidden />
        Exporteren
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Sluiten"
            onClick={() => setOpen(false)}
            className="insight-modal-backdrop absolute inset-0 bg-black/45"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            className="insight-modal-panel relative z-10 flex max-h-[min(90dvh,100%)] w-full max-w-3xl flex-col border border-border bg-surface shadow-lg"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5 sm:px-7">
              <div>
                <p className="text-[11px] tracking-[0.14em] text-text-dim uppercase">
                  DJ-fees
                </p>
                <h2 id={titleId} className="mt-1 font-display text-2xl tracking-[0.04em]">
                  Exporteren
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  Kies de events. Je krijgt een CSV met één regel per DJ: datum,
                  event, DJ, fee, 10HRS en bron.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Sluiten"
                className="shrink-0 text-text-dim transition-colors hover:text-text"
              >
                <X className="size-5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex items-center gap-3 border-b border-border px-5 py-2 text-xs sm:px-7">
              <button
                type="button"
                onClick={() => toggle(events.map((e) => e.id), true)}
                className="text-text-muted underline-offset-2 hover:text-text hover:underline"
              >
                Alles selecteren
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-text-muted underline-offset-2 hover:text-text hover:underline"
              >
                Niets
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3 sm:px-7">
              {months.map((month) => {
                const ids = month.events.map((e) => e.id);
                const count = ids.filter((id) => selected.has(id)).length;
                const all = count === ids.length;
                return (
                  <div
                    key={month.key}
                    role="group"
                    aria-label={month.label}
                    className="mb-4 min-w-0 last:mb-0"
                  >
                    <label className="flex cursor-pointer items-center gap-2.5 py-1.5">
                      <input
                        type="checkbox"
                        checked={all}
                        ref={(el) => {
                          if (el) el.indeterminate = count > 0 && !all;
                        }}
                        onChange={() => toggle(ids, !all)}
                        className="size-4 accent-current"
                      />
                      <span className="text-sm font-medium capitalize">{month.label}</span>
                      <span className="text-xs text-text-dim tabular-nums">
                        {count}/{ids.length}
                      </span>
                    </label>
                    <ul className="ml-6.5 border-l border-border/70">
                      {month.events.map((event) => (
                        <li key={event.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 py-1 pl-3 text-sm">
                            <input
                              type="checkbox"
                              checked={selected.has(event.id)}
                              onChange={(e) => toggle([event.id], e.target.checked)}
                              className="size-4 shrink-0 accent-current"
                            />
                            <span className="w-32 shrink-0 text-xs whitespace-nowrap text-text-dim">
                              {formatTicketSheetDate(event.day)}
                            </span>
                            <span
                              className="min-w-0 flex-1 truncate"
                              title={displayEditionName(event.name)}
                            >
                              {displayEditionName(event.name)}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-right text-xs whitespace-nowrap tabular-nums",
                                event.spend.missing > 0 ? "text-text-dim" : "text-text-muted",
                              )}
                            >
                              {formatDjFeeSpend(event.spend)}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5 sm:px-7">
              <p className="text-sm text-text-muted tabular-nums">
                {picked.length} event{picked.length === 1 ? "" : "s"} · {pickedDjs} DJ
                {pickedDjs === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                onClick={onDownload}
                disabled={picked.length === 0}
                className="inline-flex items-center gap-2 border border-border bg-text px-4 py-2.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
              >
                <Download className="size-4" aria-hidden />
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
