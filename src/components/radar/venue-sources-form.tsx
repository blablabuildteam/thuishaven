"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  venueId: string;
  initial?: {
    websiteProgramUrl: string | null;
    instagramHandle: string | null;
    enabled: boolean;
    lastError: string | null;
  } | null;
};

export function VenueSourcesForm({ venueId, initial }: Props) {
  const router = useRouter();
  const [websiteProgramUrl, setWebsite] = useState(
    initial?.websiteProgramUrl ?? "",
  );
  const [instagramHandle, setIg] = useState(initial?.instagramHandle ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch(`/api/radar/venues/${venueId}/sources`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        websiteProgramUrl: websiteProgramUrl.trim() || null,
        instagramHandle: instagramHandle.trim() || null,
        enabled,
      }),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    setNote("Bronnen opgeslagen — cron pikt websites/IG op.");
    router.refresh();
  }

  return (
    <form
      onSubmit={save}
      className="space-y-3 border border-border bg-surface p-4"
    >
      <h3 className="font-display text-lg tracking-[0.04em]">
        Extra bronnen
      </h3>
      <p className="text-xs text-text-muted">
        Naast RA: programmapagina en Instagram van deze club/festival.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
          Programma-URL
        </span>
        <input
          value={websiteProgramUrl}
          onChange={(e) => setWebsite(e.target.value)}
          className="w-full border border-border bg-bg px-2 py-2"
          placeholder="https://club.nl/programma"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
          Instagram handle
        </span>
        <input
          value={instagramHandle}
          onChange={(e) => setIg(e.target.value)}
          className="w-full border border-border bg-bg px-2 py-2"
          placeholder="garagenoord"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Automatisch ophalen aan
      </label>
      {initial?.lastError ? (
        <p className="text-xs text-warn">Laatste fout: {initial.lastError}</p>
      ) : null}
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      {note ? <p className="text-sm text-text-muted">{note}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="border border-border px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
      >
        {busy ? "Bezig…" : "Bronnen opslaan"}
      </button>
    </form>
  );
}
