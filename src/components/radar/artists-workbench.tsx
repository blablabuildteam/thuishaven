"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArtistFilters } from "@/components/radar/artist-filters";
import {
  RadarBadge,
  RadarBadgePill,
  RadarScoreBars,
  radarScoreClass,
} from "@/components/radar/radar-badge";
import { RadarInfoTip } from "@/components/radar/radar-info-tip";
import type {
  RadarBadgeId,
  RadarPresetId,
  RadarThuishavenFilter,
} from "@/lib/radar/badge-defs";
import { RADAR_ARTIST_STATUS_NL, type RadarArtistStatus } from "@/lib/radar/types";
import { cn } from "@/lib/utils";

type Artist = {
  id: string;
  name: string;
  status: RadarArtistStatus;
  primaryGenre: string | null;
  growthScore: string | null;
  momentumScore: string | null;
  fitScore: string | null;
  bookabilityScore: string | null;
  scoreReasons: string[];
  discoverySource: string;
  country: string | null;
  residentCountry: string | null;
  raFollowerCount: number | null;
  homeGigCount: number;
  nlAudienceScore: string | null;
  lastHomeGigAt: string | null;
  nextHomeGigAt: string | null;
  topMixseriesViews: number | null;
  badges: RadarBadgeId[];
};

const STATUSES = Object.keys(RADAR_ARTIST_STATUS_NL) as RadarArtistStatus[];

function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("nl-NL");
}

function fmtCompact(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function HomeLine({ a }: { a: Artist }) {
  if (a.homeGigCount <= 0) return null;
  const last = fmtDate(a.lastHomeGigAt);
  const next = fmtDate(a.nextHomeGigAt);
  return (
    <RadarBadgePill tone="home" title="Speelde al bij Thuishaven">
      TH {a.homeGigCount}×
      {next ? ` · gepland ${next}` : last ? ` · laatst ${last}` : ""}
    </RadarBadgePill>
  );
}

function BadgeRow({ a, max }: { a: Artist; max?: number }) {
  const shown = max ? a.badges.slice(0, max) : a.badges;
  if (a.homeGigCount <= 0 && shown.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      <HomeLine a={a} />
      {shown.map((b) => (
        <RadarBadge key={b} id={b} />
      ))}
      {max && a.badges.length > max ? (
        <span className="px-1 text-[10px] text-text-dim">+{a.badges.length - max}</span>
      ) : null}
    </div>
  );
}

function ScoreCell({ a, size = "md" }: { a: Artist; size?: "md" | "lg" }) {
  const total = num(a.growthScore);
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "font-display leading-none tabular-nums",
          size === "lg" ? "text-5xl" : "w-9 text-2xl",
          radarScoreClass(total),
        )}
      >
        {total != null ? Math.round(total) : "—"}
      </span>
      <RadarScoreBars
        momentum={num(a.momentumScore)}
        fit={num(a.fitScore)}
        bookability={num(a.bookabilityScore)}
      />
    </div>
  );
}

function Spotlight({ artists }: { artists: Artist[] }) {
  return (
    <section aria-label="Top 3" className="grid gap-3 md:grid-cols-3">
      {artists.map((a, i) => (
        <Link
          key={a.id}
          href={`/radar/artiesten/${a.id}`}
          className={cn(
            "group relative flex flex-col justify-between overflow-hidden border bg-surface p-4 transition-colors hover:border-text",
            i === 0 ? "border-text" : "border-border",
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-3 right-3 font-display text-[5.5rem] leading-none text-text/[0.06]"
          >
            {i + 1}
          </span>
          <div className="relative">
            <p className="text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
              #{i + 1} in deze selectie
            </p>
            <p className="mt-1 font-display text-2xl tracking-[0.02em] group-hover:underline">
              {a.name}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-text-muted">
              {a.scoreReasons?.[0] ?? a.discoverySource}
            </p>
            <BadgeRow a={a} max={3} />
          </div>
          <div className="relative mt-4 flex justify-end">
            <ScoreCell a={a} size="lg" />
          </div>
        </Link>
      ))}
    </section>
  );
}

export function ArtistsWorkbench({
  initial,
  total,
  page,
  pageSize,
  spotifyReady,
  badgeCounts,
  presetCounts,
  thCounts,
}: {
  initial: Artist[];
  total: number;
  page: number;
  pageSize: number;
  spotifyReady: boolean;
  badgeCounts?: Partial<Record<RadarBadgeId, number>>;
  presetCounts?: Partial<Record<RadarPresetId, number>>;
  thCounts?: Partial<Record<RadarThuishavenFilter, number>>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sort = searchParams.get("sort") || "score";
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rankOffset = (page - 1) * pageSize;
  const showRank = sort !== "name" && sort !== "newest";

  function goPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    startTransition(() => router.replace(`?${params.toString()}`));
  }

  async function addArtist(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = spotifyReady ? { spotifyQuery: addName } : { name: addName };
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
    startTransition(() => router.refresh());
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
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <ArtistFilters
        total={total}
        badgeCounts={badgeCounts}
        presetCounts={presetCounts}
        thCounts={thCounts}
      />

      {page === 1 && initial.length >= 3 && showRank ? (
        <Spotlight artists={initial.slice(0, 3)} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-dim">
          {showRank ? "Ranking binnen je huidige selectie." : null}
          {pending ? " Laden…" : ""}
        </p>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="border border-border px-3 py-1.5 text-sm hover:border-text"
        >
          {showAdd ? "Annuleren" : "+ Artiest toevoegen"}
        </button>
      </div>

      {showAdd ? (
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
              autoFocus
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Artiestnaam…"
              className="w-full border border-border bg-bg px-2 py-2"
            />
          </label>
          <button
            type="submit"
            className="border border-text bg-text px-3 py-2 text-sm text-bg"
          >
            Toevoegen
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {initial.length === 0 ? (
          <EmptyRow />
        ) : (
          initial.map((a, i) => (
            <li
              key={a.id}
              className={cn(
                "border border-border bg-surface p-3",
                a.homeGigCount > 0 && "border-l-4 border-l-text",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/radar/artiesten/${a.id}`} className="font-medium hover:underline">
                    {showRank ? (
                      <span className="mr-1.5 text-text-dim tabular-nums">
                        {rankOffset + i + 1}.
                      </span>
                    ) : null}
                    {a.name}
                  </Link>
                  <BadgeRow a={a} max={4} />
                  <p className="mt-1 line-clamp-1 text-[11px] text-text-dim">
                    {a.scoreReasons?.[0] ?? a.discoverySource}
                  </p>
                </div>
                <ScoreCell a={a} />
              </div>
            </li>
          ))
        )}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto border border-border md:block">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-elevated/50 text-left text-[10px] tracking-[0.12em] text-text-dim uppercase">
              {showRank ? <th className="w-10 px-3 py-2.5 text-right font-medium">#</th> : null}
              <th className="px-3 py-2.5 font-medium">Artiest</th>
              <th className="px-3 py-2.5 font-medium">
                <span className="inline-flex items-center gap-1">
                  Score · M F B
                  <RadarInfoTip topic="totaal" />
                </span>
              </th>
              <th className="px-3 py-2.5 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  NL
                  <RadarInfoTip topic="nl-audience" align="end" />
                </span>
              </th>
              <th className="px-3 py-2.5 text-right font-medium">RA-volgers</th>
              <th className="px-3 py-2.5 text-right font-medium">Set-views</th>
              <th className="px-3 py-2.5 font-medium">Land</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 ? (
              <tr>
                <td colSpan={showRank ? 8 : 7}>
                  <EmptyRow />
                </td>
              </tr>
            ) : (
              initial.map((a, i) => (
                <tr
                  key={a.id}
                  className={cn(
                    "border-b border-border/70 align-top transition-colors hover:bg-surface-hover",
                    a.homeGigCount > 0 && "shadow-[inset_3px_0_0_var(--text)]",
                  )}
                >
                  {showRank ? (
                    <td className="px-3 py-3 text-right font-mono text-xs text-text-dim tabular-nums">
                      {rankOffset + i + 1}
                    </td>
                  ) : null}
                  <td className="max-w-[28rem] px-3 py-3">
                    <Link href={`/radar/artiesten/${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    <BadgeRow a={a} />
                    <p className="mt-1 line-clamp-1 text-[11px] text-text-dim">
                      {a.scoreReasons?.[0] ?? a.discoverySource}
                      {a.primaryGenre ? ` · ${a.primaryGenre}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <ScoreCell a={a} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-text-muted">
                    {a.nlAudienceScore != null ? Math.round(Number(a.nlAudienceScore)) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-text-muted">
                    {fmtNum(a.raFollowerCount)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-text-muted">
                    {fmtCompact(a.topMixseriesViews)}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {a.residentCountry ?? a.country ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={a.status}
                      disabled={busyId === a.id}
                      onChange={(e) => setArtistStatus(a.id, e.target.value as RadarArtistStatus)}
                      className="max-w-[9rem] border border-border bg-bg px-1.5 py-1 text-xs"
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
          onClick={() => goPage(page - 1)}
          className="border border-border px-3 py-1.5 disabled:opacity-40"
        >
          ← Vorige
        </button>
        <span className="text-text-muted">
          Pagina {page} van {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount || pending}
          onClick={() => goPage(page + 1)}
          className="border border-border px-3 py-1.5 disabled:opacity-40"
        >
          Volgende →
        </button>
      </div>
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-display text-lg">Niemand in deze selectie</p>
      <p className="mt-1 text-sm text-text-muted">
        Haal een filter weg, of zet Thuishaven op &ldquo;Alle&rdquo;.
      </p>
    </div>
  );
}
