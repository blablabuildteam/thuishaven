"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, CheckCircle2 } from "lucide-react";
import { externalEventDayInput } from "@/lib/dashboard/external-ticket-events";
import { cn, formatNumber } from "@/lib/utils";

const inputClassName =
  "w-full border border-border bg-bg px-3 py-2.5 text-sm outline-none transition-colors focus:border-text";

type ExternalTicketEventFormProps = {
  event: {
    id: string;
    name: string;
    startsAt: string;
    expectedAttendees: number;
    scanned: number | null;
  };
};

export function ExternalTicketEventForm({ event }: ExternalTicketEventFormProps) {
  const router = useRouter();
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(externalEventDayInput(new Date(event.startsAt)));
  const [attendees, setAttendees] = useState(String(event.expectedAttendees));
  const [scanned, setScanned] = useState(
    event.scanned == null ? "" : String(event.scanned),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);

    const scannedValue =
      scanned.trim() === "" ? null : Number.parseInt(scanned, 10);

    try {
      const res = await fetch(`/api/dashboard/external-ticket-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startsAt: date,
          expectedAttendees: Number(attendees),
          scanned: scannedValue,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Opslaan mislukt");
    } finally {
      setPending(false);
    }
  }

  const scannedNum = scanned.trim() === "" ? null : Number.parseInt(scanned, 10);
  const expectedNum = Number(attendees);
  const scanRate =
    scannedNum != null && expectedNum > 0 ? (scannedNum / expectedNum) * 100 : null;

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1.5 block text-[11px] tracking-wide text-text-dim uppercase">
            Eventnaam
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            className={inputClassName}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[11px] tracking-wide text-text-dim uppercase">
            Datum
          </span>
          <div className="relative">
            <CalendarDays
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-dim"
              aria-hidden
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={cn(inputClassName, "dashboard-date-input pl-10 pr-3")}
            />
          </div>
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block text-[11px] tracking-wide text-text-dim uppercase">
            Verwachte bezoekers (Totaal)
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            required
            className={inputClassName}
          />
        </label>
      </div>

      <section className="border border-border bg-surface/40 p-5">
        <h2 className="font-display text-xl tracking-[0.04em]">Gescand</h2>
        <p className="mt-1 text-sm text-text-muted">
          Vul in na afloop van het event — dit komt in de Gescand-kolom op het
          ticketssheet.
        </p>
        <label className="mt-4 block max-w-xs text-sm">
          <span className="mb-1.5 block text-[11px] tracking-wide text-text-dim uppercase">
            Werkelijk gescand
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={scanned}
            onChange={(e) => setScanned(e.target.value)}
            className={inputClassName}
            placeholder="Nog niet ingevuld"
          />
        </label>
        {scanRate != null && (
          <p className="mt-3 text-sm text-text-muted">
            {formatNumber(scannedNum ?? 0)} van {formatNumber(expectedNum)} (
            {scanRate.toFixed(0)}%)
          </p>
        )}
      </section>

      {error && (
        <p
          className="border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      {success && (
        <p className="flex items-center gap-2 border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Wijzigingen opgeslagen
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "border border-border bg-text px-5 py-2.5 text-sm text-bg hover:opacity-90",
            pending && "opacity-60",
          )}
        >
          {pending ? "Opslaan…" : "Opslaan"}
        </button>
        <Link href="/dashboard/tickets" className="text-sm text-text-muted hover:text-text">
          Terug naar tickets
        </Link>
      </div>
    </form>
  );
}
