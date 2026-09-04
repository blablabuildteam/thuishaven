"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  dayStatusLabels,
  formatEuro,
  type AvailabilityDay,
  type DayStatus,
} from "@/lib/mock/availability";
import { StatusBadge } from "@/components/ui/status-badge";

const QUICK_STATUSES: { value: DayStatus; label: string }[] = [
  { value: "available", label: "Open" },
  { value: "hold", label: "In optie" },
  { value: "booked_external", label: "Bezet" },
  { value: "own_event", label: "Eigen event" },
  { value: "closed", label: "Dicht" },
];

type Props = {
  initialDays: AvailabilityDay[];
  source: "db" | "mock";
};

export function AvailabilityAdmin({ initialDays, source }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<DayStatus>("available");
  const [label, setLabel] = useState("");
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () => [...initialDays].sort((a, b) => a.date.localeCompare(b.date)),
    [initialDays],
  );
  const openDays = sorted.filter((d) => d.status === "available");
  const otherDays = sorted.filter((d) => d.status !== "available");
  const visible = showAll ? sorted : openDays;

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

  async function addOpenDay() {
    if (!date) return;
    const ok = await saveDay({
      date,
      status,
      label: label.trim() || (status === "available" ? "Beschikbaar" : null),
    });
    if (ok) {
      setMessage(
        status === "available"
          ? "Open dag opgeslagen — zichtbaar op de live agenda."
          : "Dag opgeslagen.",
      );
      setDate("");
      setLabel("");
      setStatus("available");
    }
  }

  async function setDayStatus(day: AvailabilityDay, next: DayStatus) {
    await saveDay({
      id: day.id.startsWith("fill-") ? undefined : day.id,
      date: day.date,
      status: next,
      dayPart: day.dayPart,
      label: day.label ?? null,
      priceFrom: day.priceFrom ?? null,
      notes: day.notes ?? null,
      areas: day.areas ?? [],
    });
  }

  async function remove(id: string) {
    if (id.startsWith("fill-")) return;
    if (!confirm("Deze dag verwijderen uit de agenda?")) return;
    setError(null);
    const res = await fetch(`/api/outreach/availability?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Verwijderen mislukt");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="border border-border bg-surface p-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg tracking-[0.06em]">
            Snel een dag zetten
          </h3>
          <p className="text-xs text-text-dim">
            {source === "db" ? "Live database" : "Mock — seed eerst"}
          </p>
        </div>
        <p className="mb-4 text-sm text-text-muted">
          Kies een datum en status. Open dagen (wo/do/vr) komen op de deelbare
          agenda.
        </p>

        <div className="flex flex-wrap gap-2">
          {QUICK_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(s.value)}
              className={
                status === s.value
                  ? "bg-accent px-3 py-1.5 font-display text-xs tracking-[0.1em] text-accent-contrast"
                  : "border border-border bg-bg px-3 py-1.5 font-display text-xs tracking-[0.1em] text-text-muted hover:border-accent"
              }
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs text-text-muted">
            Datum
            <input
              type="date"
              className="mt-1 w-full border border-border bg-bg px-3 py-2.5 text-sm text-text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="text-xs text-text-muted">
            Label (optioneel)
            <input
              className="mt-1 w-full border border-border bg-bg px-3 py-2.5 text-sm text-text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="bijv. Hele dag · Circustent"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!date || pending}
              onClick={() => void addOpenDay()}
              className="w-full bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50 sm:w-auto"
            >
              Opslaan
            </button>
          </div>
        </div>

        {(error || message) && (
          <p
            className={`mt-3 text-sm ${error ? "text-danger" : "text-text-muted"}`}
          >
            {error ?? message}
          </p>
        )}
      </div>

      <div className="border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h3 className="font-display text-lg tracking-[0.06em]">
              Open dagen
            </h3>
            <p className="text-xs text-text-dim">
              {openDays.length} open
              {otherDays.length ? ` · ${otherDays.length} overig in DB` : ""}
            </p>
          </div>
          <button
            type="button"
            className="text-xs text-accent underline-offset-2 hover:underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Alleen open tonen" : "Alles tonen"}
          </button>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">
            Nog geen open dagen. Voeg hierboven een datum toe.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((day) => (
              <li
                key={day.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-[7rem]">
                  <p className="font-mono text-sm text-text">{day.date}</p>
                  <p className="text-xs text-text-muted">
                    {day.label ?? dayStatusLabels[day.status]}
                  </p>
                </div>
                <StatusBadge
                  tone={
                    day.status === "available"
                      ? "success"
                      : day.status === "hold"
                        ? "info"
                        : "danger"
                  }
                >
                  {dayStatusLabels[day.status]}
                </StatusBadge>
                {day.priceFrom != null ? (
                  <span className="font-mono text-xs text-text-dim">
                    {formatEuro(day.priceFrom)}
                  </span>
                ) : null}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <select
                    className="border border-border bg-bg px-2 py-1.5 text-xs text-text"
                    value={day.status}
                    disabled={pending}
                    onChange={(e) =>
                      void setDayStatus(day, e.target.value as DayStatus)
                    }
                  >
                    {QUICK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {!day.id.startsWith("fill-") ? (
                    <button
                      type="button"
                      className="text-xs text-danger underline-offset-2 hover:underline"
                      onClick={() => void remove(day.id)}
                    >
                      Weg
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
