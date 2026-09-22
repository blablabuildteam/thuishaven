"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { nl } from "date-fns/locale";
import {
  dayStatusLabels,
  type AvailabilityDay,
  type DayStatus,
} from "@/lib/mock/availability";
import { cn } from "@/lib/utils";

const STATUSES: { value: DayStatus; label: string; swatch: string }[] = [
  {
    value: "available",
    label: "Open",
    swatch: "bg-accent text-accent-contrast",
  },
  { value: "hold", label: "In optie", swatch: "bg-warn text-black" },
  {
    value: "booked_external",
    label: "Bezet",
    swatch: "bg-danger text-white",
  },
  { value: "own_event", label: "Eigen event", swatch: "bg-danger text-white" },
  { value: "closed", label: "Dicht", swatch: "bg-surface text-text-muted" },
];

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"] as const;

type Props = {
  initialDays: AvailabilityDay[];
  source: "db" | "mock";
};

function cellStyle(status: DayStatus | null | undefined) {
  if (!status) return "border-border/60 bg-bg text-text-dim hover:border-accent";
  if (status === "available")
    return "border-accent bg-accent/20 text-text hover:bg-accent/30";
  if (status === "hold")
    return "border-warn/60 bg-warn/15 text-text hover:bg-warn/25";
  if (status === "closed")
    return "border-border bg-surface/50 text-text-dim line-through";
  return "border-danger/40 bg-danger/10 text-text-muted";
}

export function AvailabilityAdmin({ initialDays, source }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [applyStatus, setApplyStatus] = useState<DayStatus>("available");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, AvailabilityDay>();
    for (const d of initialDays) m.set(d.date, d);
    return m;
  }, [initialDays]);

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const rows: Date[][] = [];
    let cursor = start;
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(cursor);
        cursor = addDays(cursor, 1);
      }
      rows.push(week);
    }
    return rows;
  }, [month]);

  const monthKey = format(month, "yyyy-MM");
  const openCount = initialDays.filter((d) => d.status === "available").length;
  const selectedList = useMemo(() => [...selected].sort(), [selected]);

  function toggleDay(iso: string, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClicked) {
        const a = lastClicked < iso ? lastClicked : iso;
        const b = lastClicked < iso ? iso : lastClicked;
        let cursor = parseISO(a);
        const end = parseISO(b);
        while (cursor <= end) {
          const key = format(cursor, "yyyy-MM-dd");
          if (key.startsWith(monthKey)) next.add(key);
          cursor = addDays(cursor, 1);
        }
      } else if (next.has(iso)) {
        next.delete(iso);
      } else {
        next.add(iso);
      }
      return next;
    });
    setLastClicked(iso);
  }

  async function applyToSelected() {
    if (selectedList.length === 0) return;
    setError(null);
    setMessage(null);

    let okCount = 0;
    for (const iso of selectedList) {
      const existing = byDate.get(iso);
      const res = await fetch("/api/outreach/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:
            existing && !existing.id.startsWith("fill-")
              ? existing.id
              : undefined,
          date: iso,
          status: applyStatus,
          dayPart: existing?.dayPart ?? "full",
          label:
            existing?.label ??
            (applyStatus === "available"
              ? "Beschikbaar"
              : dayStatusLabels[applyStatus]),
          priceFrom: existing?.priceFrom ?? null,
          notes: existing?.notes ?? null,
          areas: existing?.areas ?? [],
        }),
      });
      if (res.ok) okCount += 1;
      else {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data.error === "string"
            ? data.error
            : `Opslaan mislukt bij ${iso}`,
        );
        break;
      }
    }

    if (okCount > 0) {
      setMessage(
        `${okCount} dag${okCount === 1 ? "" : "en"} → ${dayStatusLabels[applyStatus]}`,
      );
      setSelected(new Set());
      startTransition(() => router.refresh());
    }
  }

  async function clearSelected() {
    if (selectedList.length === 0) return;
    if (
      !confirm(
        `${selectedList.length} geselecteerde dag(en) uit de agenda wissen?`,
      )
    ) {
      return;
    }
    setError(null);
    for (const iso of selectedList) {
      const existing = byDate.get(iso);
      if (!existing || existing.id.startsWith("fill-")) continue;
      await fetch(`/api/outreach/availability?id=${existing.id}`, {
        method: "DELETE",
      });
    }
    setSelected(new Set());
    setMessage("Geselecteerde dagen gewist");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-2xl tracking-[0.06em] capitalize">
            {format(month, "MMMM yyyy", { locale: nl })}
          </p>
          <p className="text-xs text-text-dim">
            {openCount} open · {source === "db" ? "live" : "mock"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="border border-border px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            ←
          </button>
          <button
            type="button"
            className="border border-border px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
            Vandaag
          </button>
          <button
            type="button"
            className="border border-border px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            →
          </button>
        </div>
      </div>

      <p className="text-sm text-text-muted">
        Selecteer dagen (klik of Shift+klik voor een range). Kies daarna een
        status en pas toe.
      </p>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAYS.map((d) => (
          <p
            key={d}
            className="text-center font-display text-[10px] tracking-[0.14em] text-text-dim sm:text-xs"
          >
            {d}
          </p>
        ))}
      </div>
      <div className="space-y-1 sm:space-y-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 sm:gap-2">
            {week.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const inMonth = iso.startsWith(monthKey);
              const row = byDate.get(iso);
              const isOn = selected.has(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!inMonth || pending}
                  onClick={(e) => {
                    if (!inMonth) return;
                    toggleDay(iso, e.shiftKey);
                  }}
                  className={cn(
                    "flex min-h-[3.25rem] flex-col items-start border p-1.5 text-left transition-colors sm:min-h-[4.5rem] sm:p-2",
                    !inMonth && "invisible",
                    inMonth && cellStyle(row?.status),
                    isOn && "ring-2 ring-accent ring-offset-1 ring-offset-bg",
                  )}
                >
                  <span className="font-mono text-xs sm:text-sm">
                    {format(day, "d")}
                  </span>
                  {row ? (
                    <span className="mt-auto text-[10px] leading-tight text-text-muted sm:text-[11px]">
                      {dayStatusLabels[row.status]}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <label className="text-xs text-text-dim">
          Status voor selectie
          <select
            className="mt-1.5 block border border-border bg-bg px-3 py-2 text-sm text-text"
            value={applyStatus}
            onChange={(e) => setApplyStatus(e.target.value as DayStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || selectedList.length === 0}
          onClick={() => void applyToSelected()}
          className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
        >
          {pending
            ? "Bezig…"
            : selectedList.length === 0
              ? "Selecteer dagen"
              : `Pas toe op ${selectedList.length}`}
        </button>
        {selectedList.length > 0 ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSelected(new Set())}
              className="border border-border px-3 py-2.5 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Wis selectie
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void clearSelected()}
              className="text-sm text-danger underline-offset-2 hover:underline"
            >
              Dagen wissen
            </button>
          </>
        ) : null}
      </div>

      {(error || message) && (
        <p
          className={`text-sm ${error ? "text-danger" : "text-text-muted"}`}
          role={error ? "alert" : undefined}
        >
          {error ?? message}
        </p>
      )}
    </div>
  );
}
