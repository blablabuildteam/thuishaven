"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  venueId?: string | null;
  venueName?: string | null;
  defaultTitle?: string;
  compact?: boolean;
};

export function PartyIngestForm({
  venueId,
  venueName,
  defaultTitle = "",
  compact = false,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [startsAt, setStartsAt] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [lineupText, setLineupText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch("/api/radar/parties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId: venueId ?? null,
        title: title.trim() || venueName || "Untitled party",
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        externalUrl: externalUrl.trim() || null,
        lineupText,
        source: "manual",
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      party?: {
        artistsCreated: number;
        artistsMatched: number;
        lineupSlots: number;
      };
    };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    const p = data.party;
    setNote(
      p
        ? `${p.lineupSlots} namen · ${p.artistsCreated} nieuw · ${p.artistsMatched} bekend`
        : "Opgeslagen",
    );
    setLineupText("");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className={`space-y-3 border border-border bg-surface ${compact ? "p-3" : "p-4"}`}
    >
      <h3 className="font-display text-lg tracking-[0.04em]">
        Line-up toevoegen
      </h3>
      <p className="text-xs text-text-muted">
        Plak namen (komma, regel, · of b2b). Optioneel: link naar party-pagina.
        {venueName ? ` Venue: ${venueName}.` : ""}
      </p>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Titel
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full border border-border bg-bg px-2 py-2"
            placeholder="Party / editie"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Datum / tijd
          </span>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
          Link (website / IG / tickets)
        </span>
        <input
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          className="w-full border border-border bg-bg px-2 py-2"
          placeholder="https://…"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
          Line-up
        </span>
        <textarea
          value={lineupText}
          onChange={(e) => setLineupText(e.target.value)}
          required
          rows={compact ? 4 : 6}
          className="w-full border border-border bg-bg px-2 py-2 font-mono text-xs"
          placeholder={"Artist A\nArtist B b2b Artist C\nArtist D, Artist E"}
        />
      </label>
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      {note ? <p className="text-sm text-text-muted">{note}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="border border-accent bg-accent px-3 py-2 text-sm text-accent-contrast disabled:opacity-50"
      >
        {busy ? "Bezig…" : "Opslaan in Radar"}
      </button>
    </form>
  );
}
