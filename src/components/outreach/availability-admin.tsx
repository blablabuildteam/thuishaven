"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  dayStatusLabels,
  type AvailabilityDay,
  type DayStatus,
} from "@/lib/mock/availability";

const STATUSES: DayStatus[] = [
  "available",
  "hold",
  "booked_external",
  "own_event",
  "closed",
];

type Props = {
  initialDays: AvailabilityDay[];
  source: "db" | "mock";
};

export function AvailabilityAdmin({ initialDays, source }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: "",
    status: "available" as DayStatus,
    dayPart: "full",
    label: "",
    priceFrom: "",
    priceNote: "",
    notes: "",
  });

  async function save() {
    setError(null);
    const res = await fetch("/api/outreach/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        status: form.status,
        dayPart: form.dayPart,
        label: form.label || null,
        priceFrom: form.priceFrom ? Number(form.priceFrom) : null,
        priceNote: form.priceNote || null,
        notes: form.notes || null,
        areas: ["Tempel", "Loods", "Circus"],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    setForm((f) => ({ ...f, date: "", label: "", priceFrom: "", notes: "" }));
    startTransition(() => router.refresh());
  }

  async function updateStatus(day: AvailabilityDay, status: DayStatus) {
    setError(null);
    const res = await fetch("/api/outreach/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: day.id,
        date: day.date,
        status,
        dayPart: day.dayPart,
        label: day.label ?? null,
        priceFrom: day.priceFrom ?? null,
        priceNote: day.priceNote ?? null,
        areas: day.areas ?? [],
        notes: day.notes ?? null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Update mislukt");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!confirm("Deze dag verwijderen?")) return;
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg tracking-[0.06em]">
            Dag toevoegen / bijwerken
          </h3>
          <p className="text-xs text-text-dim">
            Bron: {source === "db" ? "database" : "mock (seed eerst)"}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-text-muted">
            Datum
            <input
              type="date"
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label className="text-xs text-text-muted">
            Status
            <select
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as DayStatus })
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {dayStatusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Dagdeel
            <select
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={form.dayPart}
              onChange={(e) => setForm({ ...form, dayPart: e.target.value })}
            >
              <option value="full">Hele dag</option>
              <option value="day">Overdag</option>
              <option value="evening">Avond</option>
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Label
            <input
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Optioneel"
            />
          </label>
          <label className="text-xs text-text-muted">
            Prijs vanaf (€)
            <input
              type="number"
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={form.priceFrom}
              onChange={(e) => setForm({ ...form, priceFrom: e.target.value })}
              placeholder="8500"
            />
          </label>
          <label className="text-xs text-text-muted">
            Notities
            <input
              className="mt-1 w-full border border-border bg-bg px-3 py-2 text-sm text-text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!form.date || pending}
            onClick={() => void save()}
            className="bg-accent px-4 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
          >
            Opslaan
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Prijs</th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Actie</th>
            </tr>
          </thead>
          <tbody>
            {initialDays.map((day) => (
              <tr key={day.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{day.date}</td>
                <td className="px-4 py-3">
                  <select
                    className="border border-border bg-bg px-2 py-1 text-xs"
                    value={day.status}
                    onChange={(e) =>
                      void updateStatus(day, e.target.value as DayStatus)
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {dayStatusLabels[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">
                  {day.priceFrom ?? "—"}
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {day.label ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-xs text-danger underline-offset-2 hover:underline"
                    onClick={() => void remove(day.id)}
                  >
                    Verwijder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
