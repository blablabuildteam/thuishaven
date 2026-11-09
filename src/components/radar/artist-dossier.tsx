"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RADAR_ARTIST_STATUS_NL, type RadarArtistStatus } from "@/lib/radar/types";

type Props = {
  artist: {
    id: string;
    name: string;
    status: RadarArtistStatus;
    primaryGenre: string | null;
    secondaryGenres: string[] | null;
    growthScore: string | null;
    growthVelocity: string | null;
    notes: string | null;
    discoverySource: string;
    imageUrl: string | null;
    growthBreakdown: Record<string, unknown> | null;
  };
  profiles: Array<{
    platform: string;
    url: string | null;
    handle: string | null;
    externalId: string | null;
    lastSyncedAt: string | Date | null;
  }>;
  recentMetrics: Array<{
    id: string;
    platform: string;
    capturedAt: string | Date;
    metrics: Record<string, number | string | null>;
  }>;
};

const STATUSES = Object.keys(RADAR_ARTIST_STATUS_NL) as RadarArtistStatus[];

export function ArtistDossier({ artist, profiles, recentMetrics }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(artist.notes ?? "");
  const [status, setStatus] = useState(artist.status);
  const [genre, setGenre] = useState(artist.primaryGenre ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/radar/artists/${artist.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/radar/artiesten"
            className="text-xs text-text-muted hover:text-text"
          >
            ← Artiesten
          </Link>
          <h1 className="mt-2 font-display text-3xl tracking-[0.03em] sm:text-4xl">
            {artist.name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            via {artist.discoverySource}
            {artist.primaryGenre ? ` · ${artist.primaryGenre}` : ""}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-px border border-border bg-border">
          <div className="bg-surface px-4 py-3">
            <dt className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Groeiscore
            </dt>
            <dd className="font-display text-3xl tabular-nums">
              {artist.growthScore ?? "—"}
            </dd>
          </div>
          <div className="bg-surface px-4 py-3">
            <dt className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Velocity
            </dt>
            <dd className="font-display text-3xl tabular-nums">
              {artist.growthVelocity ?? "—"}
            </dd>
          </div>
        </dl>
      </div>

      {error ? <p className="text-sm text-warn">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4 border border-border bg-surface p-4">
          <h2 className="font-display text-lg tracking-[0.04em]">Workflow</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Status
            </span>
            <select
              value={status}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as RadarArtistStatus;
                setStatus(next);
                void save({ status: next });
              }}
              className="w-full border border-border bg-bg px-2 py-2"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RADAR_ARTIST_STATUS_NL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Primair genre
            </span>
            <div className="flex gap-2">
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="min-w-0 flex-1 border border-border bg-bg px-2 py-2"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({
                    primaryGenre: genre || null,
                    genreManual: true,
                  })
                }
                className="border border-border px-3 py-2 text-sm hover:border-accent"
              >
                Bewaar
              </button>
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
              Notities
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="w-full border border-border bg-bg px-2 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ notes })}
              className="border border-accent bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              Notitie opslaan
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ syncSpotify: true })}
              className="border border-border px-3 py-2 text-sm hover:border-accent"
            >
              Spotify verversen
            </button>
          </div>
        </section>

        <section className="space-y-4 border border-border bg-surface p-4">
          <h2 className="font-display text-lg tracking-[0.04em]">Profielen</h2>
          {profiles.length === 0 ? (
            <p className="text-sm text-text-muted">Nog geen platformprofielen.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {profiles.map((p) => (
                <li
                  key={`${p.platform}-${p.externalId}`}
                  className="flex items-center justify-between gap-2 border-b border-border/60 py-2"
                >
                  <span className="capitalize text-text-muted">{p.platform}</span>
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate underline hover:text-text"
                    >
                      {p.handle ?? "open"}
                    </a>
                  ) : (
                    <span>{p.handle ?? p.externalId ?? "—"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h2 className="pt-2 font-display text-lg tracking-[0.04em]">
            Recente metrics
          </h2>
          {recentMetrics.length === 0 ? (
            <p className="text-sm text-text-muted">Nog geen snapshots.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">
              {recentMetrics.slice(0, 12).map((m) => (
                <li key={m.id} className="border border-border/70 px-2 py-1.5">
                  <p className="text-text-dim">
                    {m.platform} ·{" "}
                    {new Date(m.capturedAt).toLocaleString("nl-NL")}
                  </p>
                  <p className="font-mono tabular-nums text-text-muted">
                    {Object.entries(m.metrics)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
