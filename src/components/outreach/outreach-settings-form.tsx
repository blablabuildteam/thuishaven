"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { OUTREACH_SENDER_PROFILES } from "@/lib/outreach/sender-profiles";
import type { OutreachSettings } from "@/lib/outreach/settings";

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
  const [notes, setNotes] = useState(initial.notes ?? "");

  const dayLabel = initial.sendWeekdays
    .map((d) => ["", "ma", "di", "wo", "do", "vr", "za", "zo"][d] ?? String(d))
    .join(" · ");
  const perWeek = initial.sendWeekdays.length * initial.mailsPerDay;
  const windowStart = Math.max(8 * 60 + 20, initial.preferredHour * 60 - 25);
  const windowEnd = Math.min(11 * 60 + 30, initial.preferredHour * 60 + 85);
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const cadenceLine = `Max ${initial.mailsPerDay}/dag op ${dayLabel} (~${perWeek}/week) · venster ${fmt(windowStart)}–${fmt(windowEnd)} · ${
    initial.cadenceSource === "opens"
      ? `eigen data (${initial.cadenceSampleOpens} opens)`
      : "benchmark"
  }`;

  async function onSave() {
    setError(null);
    setMessage(null);
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
        notes: notes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    setMessage("Opgeslagen — geldt voor nieuwe testsends.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-3 border border-border bg-surface p-4">
        <h2 className="font-display text-xl tracking-[0.04em]">
          Verzendritme
        </h2>
        <p className="text-sm text-text-muted">
          Automatisch bepaald — geen handmatige knoppen. De Wachtrij gebruikt
          dit voor planningsuggesties (nog geen auto-send).
        </p>
        <p className="text-sm">{cadenceLine}</p>
        <p className="text-xs text-text-dim">{initial.cadenceRationale}</p>
      </section>

      <section className="space-y-4 border border-border bg-surface p-4">
        <h2 className="font-display text-xl tracking-[0.04em]">
          Afzender-profielen
        </h2>
        <p className="text-sm text-text-muted">
          Per mail kies je Evenementen, Reijner of Yoram. Die adressen moeten
          in Brevo goedgekeurd zijn én hieronder op de allowlist staan.
        </p>
        <ul className="space-y-2 text-sm">
          {OUTREACH_SENDER_PROFILES.map((p) => (
            <li key={p.id} className="border border-border/70 bg-bg px-3 py-2">
              <span className="font-medium text-text">{p.label}</span>
              <span className="text-text-dim">
                {" "}
                · {p.name} &lt;{p.email}&gt;
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-dim">
          Fallback hieronder geldt alleen voor testsends zonder gekozen afzender.
        </p>
        <label className="block text-xs text-text-dim">
          Fallback afzender e-mail
          <input
            className="mt-1.5 w-full border border-border bg-bg px-3 py-2 text-sm"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
          />
        </label>
        <label className="block text-xs text-text-dim">
          Fallback afzender naam
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
            placeholder="evenement@…, reijner@…, yoram@…"
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
