"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export function CrmNoteForm({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"note" | "call" | "linkedin">("note");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/outreach/crm/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prospectId, kind, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["note", "Notitie"],
            ["call", "Belletje"],
            ["linkedin", "LinkedIn"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={`border px-3 py-1.5 text-xs tracking-[0.08em] ${
              kind === id
                ? "border-accent bg-accent text-accent-contrast"
                : "border-border bg-bg text-text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        required
        rows={3}
        className="w-full border border-border bg-bg px-3 py-2 text-sm text-text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Wat is er gebeurd? Bijv. ‘Office manager gebeld, stuurt intern door’"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast disabled:opacity-60"
        >
          {pending ? "Opslaan…" : "Contactmoment loggen"}
        </button>
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
    </form>
  );
}
