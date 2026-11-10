"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RADAR_ARTIST_STATUS_NL, type RadarArtistStatus } from "@/lib/radar/types";

type Artist = {
  id: string;
  name: string;
  status: RadarArtistStatus;
  primaryGenre: string | null;
  growthScore: string | null;
  growthVelocity: string | null;
  momentumScore: string | null;
  fitScore: string | null;
  bookabilityScore: string | null;
  scoreReasons: string[];
  discoverySource: string;
  imageUrl: string | null;
  country: string | null;
  residentCountry: string | null;
  raFollowerCount: number | null;
  homeGigCount: number;
  hasAgency: boolean;
};

const STATUSES = Object.keys(RADAR_ARTIST_STATUS_NL) as RadarArtistStatus[];

const SORTS = [
  { value: "score", label: "Score" },
  { value: "momentum", label: "Momentum" },
  { value: "bookability", label: "Bookable" },
  { value: "ra_followers", label: "RA-volgers" },
  { value: "newest", label: "Nieuwste" },
  { value: "name", label: "Naam" },
] as const;

function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("nl-NL");
}

export function ArtistsWorkbench({
  initial,
  total,
  page,
  pageSize,
  spotifyReady,
}: {
  initial: Artist[];
  total: number;
  page: number;
  pageSize: number;
  spotifyReady: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const status = (searchParams.get("status") as "all" | RadarArtistStatus) || "all";
  const sort = searchParams.get("sort") || "score";
  const nieuw = searchParams.get("nieuw") !== "0";
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (q === current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      params.delete("page");
      startTransition(() => {
        router.replace(`?${params.toString()}`);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [q, router, searchParams]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value == null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
    if (key !== "page") params.delete("page");
    startTransition(() => router.replace(`?${params.toString()}`));
  }

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
            placeholder="Naam…"
            className="w-full border border-border bg-surface px-2 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setParam("status", e.target.value)}
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
        <label className="text-sm">
          <span className="mb-1 block text-[10px] tracking-[0.12em] text-text-dim uppercase">
            Sorteren
          </span>
          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            className="border border-border bg-surface px-2 py-2"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={nieuw}
            onChange={(e) => setParam("nieuw", e.target.checked ? "1" : "0")}
          />
          Nieuw voor Thuishaven
        </label>
        <p className="pb-2 text-xs text-text-muted">
          {total.toLocaleString("nl-NL")} resultaten
          {pending ? " · laden…" : ""}
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

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {initial.length === 0 ? (
          <li className="border border-dashed border-border px-3 py-8 text-center text-sm text-text-muted">
            Geen artiesten in deze filter.
          </li>
        ) : (
          initial.map((a) => (
            <li key={a.id} className="border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/radar/artiesten/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.name}
                  </Link>
                  {a.homeGigCount > 0 ? (
                    <p className="text-[11px] text-text-dim">
                      Al bij Thuishaven ({a.homeGigCount}×)
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-text-dim">
                    {a.scoreReasons?.[0] ?? a.discoverySource}
                  </p>
                </div>
                <span className="font-mono text-sm tabular-nums">
                  {a.growthScore ?? "—"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-text-muted">
                <span>M {a.momentumScore ?? "—"}</span>
                <span>B {a.bookabilityScore ?? "—"}</span>
                <span>RA {fmtNum(a.raFollowerCount)}</span>
              </div>
            </li>
          ))
        )}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto border border-border md:block">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-text-dim uppercase">
              <th className="px-3 py-2 font-medium">Artiest</th>
              <th className="px-3 py-2 font-medium text-right">Score</th>
              <th className="px-3 py-2 font-medium text-right">Mom.</th>
              <th className="px-3 py-2 font-medium text-right">Book.</th>
              <th className="px-3 py-2 font-medium text-right">RA</th>
              <th className="px-3 py-2 font-medium">Land</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-text-muted"
                >
                  Geen artiesten in deze filter.
                </td>
              </tr>
            ) : (
              initial.map((a) => (
                <tr key={a.id} className="border-b border-border/70">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/radar/artiesten/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.name}
                    </Link>
                    {a.homeGigCount > 0 ? (
                      <span className="ml-2 text-[10px] tracking-[0.08em] text-text-dim uppercase">
                        Al bij TH ({a.homeGigCount}×)
                      </span>
                    ) : null}
                    <p className="text-[11px] text-text-dim">
                      {a.scoreReasons?.[0] ?? a.discoverySource}
                      {a.hasAgency ? " · agency" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {a.growthScore ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">
                    {a.momentumScore ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">
                    {a.bookabilityScore ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">
                    {fmtNum(a.raFollowerCount)}
                  </td>
                  <td className="px-3 py-2.5 text-text-muted">
                    {a.residentCountry ?? a.country ?? "—"}
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

      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          disabled={page <= 1 || pending}
          onClick={() => setParam("page", String(page - 1))}
          className="border border-border px-3 py-1.5 disabled:opacity-40"
        >
          Vorige
        </button>
        <span className="text-text-muted">
          Pagina {page} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount || pending}
          onClick={() => setParam("page", String(page + 1))}
          className="border border-border px-3 py-1.5 disabled:opacity-40"
        >
          Volgende
        </button>
      </div>
    </div>
  );
}
