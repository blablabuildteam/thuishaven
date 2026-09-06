"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export type LogReplyMailOption = {
  id: string;
  companyName: string;
  toEmail: string | null;
  subject: string;
};

type Props = {
  mails: LogReplyMailOption[];
};

export function LogReplyForm({ mails }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outreachEmailId, setOutreachEmailId] = useState(mails[0]?.id ?? "");
  const [fromEmail, setFromEmail] = useState(mails[0]?.toEmail ?? "");
  const [subject, setSubject] = useState("");
  const [bodyPreview, setBodyPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSelectMail(id: string) {
    setOutreachEmailId(id);
    const mail = mails.find((m) => m.id === id);
    if (mail?.toEmail) setFromEmail(mail.toEmail);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);

    startTransition(async () => {
      const res = await fetch("/api/outreach/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromEmail,
          subject: subject || null,
          bodyPreview: bodyPreview || null,
          outreachEmailId: outreachEmailId || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        matched?: boolean;
        hint?: string;
        leadCreated?: boolean;
        sentiment?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      if (data.matched === false) {
        setError(data.hint ?? "Geen matchende mail gevonden");
        return;
      }

      const bits = ["Reply opgeslagen"];
      if (data.sentiment) bits.push(`· ${data.sentiment}`);
      if (data.leadCreated) bits.push("· warme lead aangemaakt");
      setOk(bits.join(" "));
      setSubject("");
      setBodyPreview("");
      router.refresh();
    });
  }

  if (mails.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Nog geen verzonden mails om een reply aan te koppelen. Stuur eerst een
        test vanaf E-mails.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-text-muted">
        Replies landen in <code className="text-accent">evenement@</code>. Log
        ze hier zodat Resultaten, follow-up en warme leads kloppen.
      </p>

      <label className="block text-sm">
        <span className="mb-1 block text-text-dim">Gekoppelde mail</span>
        <select
          className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
          value={outreachEmailId}
          onChange={(e) => onSelectMail(e.target.value)}
          required
        >
          {mails.map((m) => (
            <option key={m.id} value={m.id}>
              {m.companyName}
              {m.toEmail ? ` · ${m.toEmail}` : ""} — {m.subject}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-text-dim">Van (e-mail)</span>
        <input
          type="email"
          required
          className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-text-dim">Onderwerp (optioneel)</span>
        <input
          type="text"
          className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-text-dim">
          Korte inhoud / quote (optioneel)
        </span>
        <textarea
          rows={3}
          className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
          value={bodyPreview}
          onChange={(e) => setBodyPreview(e.target.value)}
          placeholder="Bijv. ‘Graag een rondleiding volgende maand’"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-60"
        >
          {pending ? "Opslaan…" : "Reply loggen"}
        </button>
        {ok ? <StatusBadge tone="success">{ok}</StatusBadge> : null}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
    </form>
  );
}
