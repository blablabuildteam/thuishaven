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
  const [brush, setBrush] = useState<DayStatus>("available");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

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
  const selected = selectedIso ? byDate.get(selectedIso) : undefined;
  const openCount = initialDays.filter((d) => d.status === "available").length;

  async function saveDay(payload: {
    id?: string;
    date: string;
    status: DayStatus;
    dayPart?: string;
    label?: string | null;
    priceFrom?: number | null;
    notes?: string | null;
    areas?: string[];
  }) {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/outreach/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayPart: "full",
        areas: [],
        ...payload,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function paintDay(iso: string) {
    const existing = byDate.get(iso);
    const ok = await saveDay({
      id: existing && !existing.id.startsWith("fill-") ? existing.id : undefined,
      date: iso,
      status: brush,
      dayPart: existing?.dayPart ?? "full",
      label:
        existing?.label ??
        (brush === "available" ? "Beschikbaar" : dayStatusLabels[brush]),
      priceFrom: existing?.priceFrom ?? null,
      notes: existing?.notes ?? null,
      areas: existing?.areas ?? [],
    });
    if (ok) {
      setMessage(`${format(parseISO(iso), "d MMM", { locale: nl })} → ${dayStatusLabels[brush]}`);
      setSelectedIso(iso);
      setLabelDraft(existing?.label ?? "");
    }
  }

  async function saveLabel() {
    if (!selectedIso) return;
    const existing = byDate.get(selectedIso);
    if (!existing) return;
    const ok = await saveDay({
      id: existing.id.startsWith("fill-") ? undefined : existing.id,
      date: selectedIso,
      status: existing.status,
      dayPart: existing.dayPart,
      label: labelDraft.trim() || null,
      priceFrom: existing.priceFrom ?? null,
      notes: existing.notes ?? null,
      areas: existing.areas ?? [],
    });
    if (ok) setMessage("Label opgeslagen");
  }

  async function clearDay() {
    if (!selectedIso) return;
    const existing = byDate.get(selectedIso);
    if (!existing || existing.id.startsWith("fill-")) {
      setSelectedIso(null);
      return;
    }
    if (!confirm("Deze dag uit de agenda verwijderen?")) return;
    setError(null);
    const res = await fetch(`/api/outreach/availability?id=${existing.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Verwijderen mislukt");
      return;
    }
    setSelectedIso(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-2xl tracking-[0.06em] capitalize">
            {format(month, "MMMM yyyy", { locale: nl })}
          </p>
          <p className="text-xs text-text-dim">
            {openCount} open dagen
            {source === "db" ? " · live" : " · mock"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            ←
          </button>
          <button
            type="button"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
            Vandaag
          </button>
          <button
            type="button"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            →
          </button>
        </div>
      </div>

      <div className="border border-border bg-surface p-3 sm:p-4">
        <p className="mb-2 text-xs text-text-muted">
          Kies een status, klik daarna op dagen in de kalender.
        </p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setBrush(s.value)}
              className={cn(
                "px-3 py-1.5 font-display text-xs tracking-[0.1em]",
                brush === s.value
                  ? s.swatch
                  : "border border-border bg-bg text-text-muted hover:border-accent",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-border bg-surface p-3 sm:p-4">
        <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
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
                const isSelected = selectedIso === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={!inMonth || pending}
                    onClick={() => {
                      if (!inMonth) return;
                      setSelectedIso(iso);
                      setLabelDraft(row?.label ?? "");
                      void paintDay(iso);
                    }}
                    className={cn(
                      "flex min-h-[3.25rem] flex-col items-start border p-1.5 text-left transition-colors sm:min-h-[4.5rem] sm:p-2",
                      !inMonth && "invisible",
                      inMonth && cellStyle(row?.status),
                      isSelected && "ring-2 ring-accent ring-offset-1 ring-offset-bg",
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
      </div>

      {selectedIso ? (
        <div className="border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg tracking-[0.06em]">
                {format(parseISO(selectedIso), "EEEE d MMMM yyyy", {
                  locale: nl,
                })}
              </p>
              <p className="text-sm text-text-muted">
                {selected
                  ? dayStatusLabels[selected.status]
                  : "Nog niet gezet — klik opnieuw met een status"}
              </p>
            </div>
            {selected && !selected.id.startsWith("fill-") ? (
              <button
                type="button"
                className="text-xs text-danger underline-offset-2 hover:underline"
                onClick={() => void clearDay()}
              >
                Dag wissen
              </button>
            ) : null}
          </div>
          {selected ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1 text-xs text-text-muted">
                Label (optioneel)
                <input
                  className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  placeholder="bijv. Circustent · hele dag"
                />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => void saveLabel()}
                className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
              >
                Label opslaan
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {(error || message) && (
        <p className={`text-sm ${error ? "text-danger" : "text-text-muted"}`}>
          {error ?? message}
        </p>
      )}
    </div>
  );
}
