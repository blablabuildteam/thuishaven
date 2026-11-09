"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { RADAR_ARTIST_STATUS_NL, type RadarArtistStatus } from "@/lib/radar/types";

type Artist = {
  id: string;
  name: string;
  status: RadarArtistStatus;
  primaryGenre: string | null;
  growthScore: string | null;
  growthVelocity: string | null;
  discoverySource: string;
  imageUrl: string | null;
};

const STATUSES = Object.keys(RADAR_ARTIST_STATUS_NL) as RadarArtistStatus[];

export function ArtistsWorkbench({
  initial,
  total,
  spotifyReady,
}: {
  initial: Artist[];
  total: number;
  spotifyReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | RadarArtistStatus>("all");
  const [error, setError] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return initial.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        (a.primaryGenre ?? "").toLowerCase().includes(needle)
      );
    });
  }, [initial, q, status]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function addArtist(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = spotifyReady
      ? { spotifyQuery: addName }
      : { name: addName };
    const res = await fetch("/api/radar/artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string; artistId?: string };
    if (!res.ok) {
      setError(data.error ?? "Toevoegen mislukt");
      return;
    }
    setAddName("");
    if (data.artistId) {
      router.push(`/radar/artiesten/${data.artistId}`);
      return;
    }
    refresh();
  }

  async function setArtistStatus(id: string, next: RadarArtistStatus) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/radar/artists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Status updaten mislukt");
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Zoeken
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Naam of genre…"
            className="w-full border border-border bg-surface px-2 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Status
          </span>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "all" | RadarArtistStatus)
            }
            className="border border-border bg-surface px-2 py-2"
          >
            <option value="all">Alle</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {RADAR_ARTIST_STATUS_NL[s]}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2 text-xs text-text-muted">
          {filtered.length} van {total}
          {pending ? " · vernieuwen…" : ""}
        </p>
      </div>

      <form
        onSubmit={addArtist}
        className="flex flex-wrap items-end gap-2 border border-border bg-surface p-3"
      >
        <label className="min-w-[16rem] flex-1 text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            {spotifyReady ? "Toevoegen via Spotify" : "Handmatig toevoegen"}
          </span>
          <input
            required
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder={spotifyReady ? "Artiestnaam…" : "Naam…"}
            className="w-full border border-border bg-bg px-2 py-2"
          />
        </label>
        <button
          type="submit"
          className="border border-accent bg-accent px-3 py-2 text-sm text-accent-contrast"
        >
          Toevoegen
        </button>
      </form>

      {error ? <p className="text-sm text-warn">{error}</p> : null}

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-text-dim uppercase">
              <th className="px-3 py-2 font-medium">Artiest</th>
              <th className="px-3 py-2 font-medium text-right">Score</th>
              <th className="px-3 py-2 font-medium text-right">Vel.</th>
              <th className="px-3 py-2 font-medium">Genre</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-text-muted"
                >
                  Geen artiesten in deze filter.
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} className="border-b border-border/70">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/radar/artiesten/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.name}
                    </Link>
                    <p className="text-[11px] text-text-dim">
                      {a.discoverySource}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {a.growthScore ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">
                    {a.growthVelocity ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-text-muted">
                    {a.primaryGenre ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={a.status}
                      disabled={busyId === a.id}
                      onChange={(e) =>
                        setArtistStatus(
                          a.id,
                          e.target.value as RadarArtistStatus,
                        )
                      }
                      className="max-w-[10rem] border border-border bg-bg px-1.5 py-1 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {RADAR_ARTIST_STATUS_NL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
