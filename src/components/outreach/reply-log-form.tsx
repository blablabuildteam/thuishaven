"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

const SENTIMENTS = [
  ["positive", "Positief"],
  ["neutral", "Neutraal"],
  ["negative", "Geen interesse"],
  ["opt_out", "Niet meer mailen"],
] as const;

type Sentiment = (typeof SENTIMENTS)[number][0];

export function ReplyLogForm({ outreachEmailId }: { outreachEmailId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment>("positive");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs text-accent hover:underline"
      >
        Antwoord gekregen? Log het hier
      </button>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/crm/replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outreachEmailId, sentiment, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 space-y-3 border border-border bg-bg p-3"
    >
      <p className="text-xs text-text-muted">
        Voor antwoorden die niet via evenement@ binnenkwamen — telefoon, eigen
        inbox, LinkedIn. Telt mee in Resultaten.
      </p>
      <div className="flex flex-wrap gap-2">
        {SENTIMENTS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSentiment(id)}
            className={`border px-3 py-1.5 text-xs tracking-[0.08em] ${
              sentiment === id
                ? "border-accent bg-accent text-accent-contrast"
                : "border-border bg-surface text-text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sentiment === "positive" ? (
        <p className="text-xs text-text-dim">
          Positief maakt er een warme lead van.
        </p>
      ) : sentiment === "opt_out" ? (
        <p className="text-xs text-text-dim">
          Het bedrijf wordt uitgesloten en krijgt geen mail meer.
        </p>
      ) : null}
      <textarea
        rows={2}
        className="w-full border border-border bg-surface px-3 py-2 text-sm text-text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Wat zeiden ze? Bijv. ‘Wil in november een rondleiding’"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-60"
        >
          {pending ? "Opslaan…" : "Antwoord opslaan"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-text-muted hover:text-text"
        >
          Annuleren
        </button>
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
    </form>
  );
}
