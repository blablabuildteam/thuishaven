"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OutreachSettings } from "@/lib/outreach/settings";

const WEEKDAY_OPTIONS: { id: number; label: string }[] = [
  { id: 1, label: "ma" },
  { id: 2, label: "di" },
  { id: 3, label: "wo" },
  { id: 4, label: "do" },
  { id: 5, label: "vr" },
];

type Props = {
  initial: OutreachSettings;
};

export function OutreachSettingsForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [senderEmail, setSenderEmail] = useState(initial.senderEmail);
  const [senderName, setSenderName] = useState(initial.senderName);
  const [replyToEmail, setReplyToEmail] = useState(initial.replyToEmail);
  const [replyToName, setReplyToName] = useState(initial.replyToName);
  const [allowedSenderEmails, setAllowedSenderEmails] = useState(
    initial.allowedSenderEmails.join(", "),
  );
  const [testRecipient, setTestRecipient] = useState(initial.testRecipient);
  const [sendWeekdays, setSendWeekdays] = useState<number[]>(
    initial.sendWeekdays,
  );
  const [mailsPerDay, setMailsPerDay] = useState(initial.mailsPerDay);
  const [preferredHour, setPreferredHour] = useState(initial.preferredHour);
  const [notes, setNotes] = useState(initial.notes ?? "");

  function toggleDay(day: number) {
    setSendWeekdays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function onSave() {
    setError(null);
    setMessage(null);
    if (sendWeekdays.length === 0) {
      setError("Kies minstens één verzenddag");
      return;
    }
    const res = await fetch("/api/outreach/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderEmail,
        senderName,
        replyToEmail,
        replyToName,
        allowedSenderEmails,
        testRecipient,
        sendWeekdays,
        mailsPerDay,
        preferredHour,
        notes: notes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    setMessage("Opgeslagen — geldt voor nieuwe testsends en de Wachtrij-planning.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-4 border border-border bg-surface p-4">
        <h2 className="font-display text-xl tracking-[0.04em]">Afzender</h2>
        <p className="text-sm text-text-muted">
          Het From-adres dat prospects zien. Moet in Brevo als goedgekeurde
          afzender staan.
        </p>
        <label className="block text-xs text-text-dim">
          Afzender e-mail
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
          />
        </label>
        <label className="block text-xs text-text-dim">
          Afzender naam
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
          />
        </label>
        <label className="block text-xs text-text-dim">
          Toegestane afzenderadressen (komma-gescheiden)
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm"
            value={allowedSenderEmails}
            onChange={(e) => setAllowedSenderEmails(e.target.value)}
            placeholder="zakelijk@thuishaven.nl, evenement@thuishaven.nl"
          />
        </label>
      </section>

      <section className="space-y-4 border border-border bg-surface p-4">
        <h2 className="font-display text-xl tracking-[0.04em]">Reply-to</h2>
        <p className="text-sm text-text-muted">
          Hier landen antwoorden. Zet later forwarding naar de tool aan zodat
          replies in Resultaten verschijnen.
        </p>
        <label className="block text-xs text-text-dim">
          Reply-to e-mail
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm"
            value={replyToEmail}
            onChange={(e) => setReplyToEmail(e.target.value)}
          />
        </label>
        <label className="block text-xs text-text-dim">
          Reply-to naam
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm"
            value={replyToName}
            onChange={(e) => setReplyToName(e.target.value)}
          />
        </label>
      </section>

      <section className="space-y-4 border border-border bg-surface p-4">
        <h2 className="font-display text-xl tracking-[0.04em]">
          Verzendritme
        </h2>
        <p className="text-sm text-text-muted">
          Suggesties in de Wachtrij spreiden bakjes over deze dagen — nog geen
          auto-send.
        </p>
        <div>
          <p className="text-xs text-text-dim">Dagen</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAY_OPTIONS.map((d) => {
              const on = sendWeekdays.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  className={
                    on
                      ? "border border-accent bg-accent/10 px-3 py-1.5 text-sm"
                      : "border border-border px-3 py-1.5 text-sm text-text-muted"
                  }
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="block text-xs text-text-dim">
            Max mails per dag
            <input
              type="number"
              min={1}
              max={40}
              className="mt-1.5 w-24 border border-border bg-bg px-3 py-2 text-sm"
              value={mailsPerDay}
              onChange={(e) => setMailsPerDay(Number(e.target.value) || 1)}
            />
          </label>
          <label className="block text-xs text-text-dim">
            Voorkeurstijd (Amsterdam)
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1.5 w-24 border border-border bg-bg px-3 py-2 text-sm"
              value={preferredHour}
              onChange={(e) => setPreferredHour(Number(e.target.value) || 0)}
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 border border-border bg-surface p-4">
        <h2 className="font-display text-xl tracking-[0.04em]">Testsend</h2>
        <label className="block text-xs text-text-dim">
          Standaard testadres
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
          />
        </label>
        <label className="block text-xs text-text-dim">
          Notitie (intern)
          <textarea
            rows={3}
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bijv. wie leest evenement@, wanneer live mag"
          />
        </label>
      </section>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-text-muted">{message}</p> : null}

      <button
        type="button"
        disabled={pending}
        onClick={() => void onSave()}
        className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-50"
      >
        Opslaan
      </button>
    </div>
  );
}
