"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClassName =
  "w-full border border-border bg-bg px-3 py-2.5 text-sm outline-none transition-colors focus:border-text";

export function AddExternalEvent() {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ name: string } | null>(null);

  function resetForm() {
    setName("");
    setDate("");
    setAttendees("");
    setError(null);
    setSuccess(null);
  }

  function close() {
    setOpen(false);
    resetForm();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => close(), 2200);
    return () => window.clearTimeout(timer);
  }, [success]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/dashboard/external-ticket-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startsAt: date,
          expectedAttendees: Number(attendees),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      router.refresh();
      setSuccess({ name: name.trim() });
    } catch {
      setError("Opslaan mislukt");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-border bg-surface px-3 py-2.5 text-sm hover:bg-surface-hover"
      >
        <Plus className="size-4" aria-hidden />
        Add external event
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Sluiten"
            onClick={() => !pending && close()}
            className="insight-modal-backdrop absolute inset-0 bg-black/45"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="insight-modal-panel relative z-10 w-full max-w-lg border border-border bg-surface p-6 shadow-lg sm:p-7"
          >
            {success ? (
              <div className="py-4 text-center">
                <div className="mx-auto flex size-12 items-center justify-center border border-success/35 bg-success/10 text-success">
                  <CheckCircle2 className="size-6" strokeWidth={1.75} aria-hidden />
                </div>
                <p className="mt-4 font-display text-xl tracking-[0.04em]">
                  Event toegevoegd
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  <span className="font-medium text-text">{success.name}</span> staat nu in
                  het ticketssheet.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 border border-border bg-text px-4 py-2.5 text-sm text-bg hover:opacity-90"
                >
                  Sluiten
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] tracking-[0.14em] text-text-dim uppercase">
                      Extern event
                    </p>
                    <h2
                      id={titleId}
                      className="mt-1 font-display text-2xl tracking-[0.04em]"
                    >
                      Add external event
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">
                      Handmatig event toevoegen — naam, datum en verwachte bezoekers
                      (Totaal-kolom).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    aria-label="Sluiten"
                    className="shrink-0 text-text-dim transition-colors hover:text-text disabled:opacity-50"
                  >
                    <X className="size-5" strokeWidth={1.5} />
                  </button>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-[11px] tracking-wide text-text-dim uppercase">
                      Eventnaam
                    </span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={200}
                      autoFocus
                      className={inputClassName}
                      placeholder="Bijv. Bedrijfsfeest ACME"
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
                        className={cn(
                          inputClassName,
                          "dashboard-date-input pl-10 pr-3",
                        )}
                      />
                    </div>
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1.5 block text-[11px] tracking-wide text-text-dim uppercase">
                      Verwachte bezoekers
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={attendees}
                      onChange={(e) => setAttendees(e.target.value)}
                      required
                      className={inputClassName}
                      placeholder="250"
                    />
                  </label>

                  {error && (
                    <p
                      className="border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                      role="alert"
                    >
                      {error}
                    </p>
                  )}

                  <div className="flex flex-wrap justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={close}
                      disabled={pending}
                      className="px-4 py-2.5 text-sm text-text-muted hover:text-text disabled:opacity-50"
                    >
                      Annuleren
                    </button>
                    <button
                      type="submit"
                      disabled={pending}
                      className={cn(
                        "border border-border bg-text px-5 py-2.5 text-sm text-bg hover:opacity-90",
                        pending && "opacity-60",
                      )}
                    >
                      {pending ? "Opslaan…" : "Toevoegen"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
