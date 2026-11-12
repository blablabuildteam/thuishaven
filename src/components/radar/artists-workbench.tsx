"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  RadarBadge,
  RadarBadgePill,
  RadarScoreBars,
} from "@/components/radar/radar-badge";
import { RadarInfoTip } from "@/components/radar/radar-info-tip";
import {
  RADAR_BADGES,
  parseBadgeFilter,
  parseThuishavenFilter,
  serializeBadgeFilter,
  type RadarBadgeFilter,
  type RadarBadgeId,
  type RadarThuishavenFilter,
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

const SORTS = [
  { value: "score", label: "Score" },
  { value: "momentum", label: "Momentum" },
  { value: "fit", label: "Fit" },
  { value: "bookability", label: "Bookable" },
  { value: "nl", label: "NL-audience" },
  { value: "ra_followers", label: "RA-volgers" },
  { value: "newest", label: "Nieuwste" },
  { value: "name", label: "Naam" },
] as const;

const PRESETS: Array<{
  label: string;
  hint: string;
  filter: RadarBadgeFilter;
  sort?: string;
}> = [
  {
    label: "Nu boeken",
    hint: "Momentum, nog niet groot, geen agency",
    filter: { include: ["hot"], exclude: ["groot", "agency"] },
  },
  {
    label: "Speelt binnenkort in NL",
    hint: "Aankomende NL-gig, nog niet groot",
    filter: { include: ["nl_gig"], exclude: ["groot"] },
  },
  {
    label: "Venster sluit",
    hint: "Groeit hard, wordt duurder",
    filter: { include: ["venster"], exclude: [] },
    sort: "momentum",
  },
  {
    label: "Viral sets",
    hint: "Mixseries ≥ 50k views",
    filter: { include: ["viral"], exclude: [] },
  },
  {
    label: "Vers binnen",
    hint: "Deze week op de radar",
    filter: { include: ["nieuw7"], exclude: [] },
  },
  {
    label: "Debutanten",
    hint: "Eerste RA-event < 3 jaar",
    filter: { include: ["debutant"], exclude: ["groot"] },
  },
];

function sameFilter(a: RadarBadgeFilter, b: RadarBadgeFilter) {
  const key = (f: RadarBadgeFilter) =>
    [...f.include].sort().join(",") + "|" + [...f.exclude].sort().join(",");
  return key(a) === key(b);
}

const TH_OPTIONS: Array<{ value: RadarThuishavenFilter; label: string }> = [
  { value: "nieuw", label: "Nieuw voor TH" },
  { value: "gespeeld", label: "Al bij Thuishaven" },
  { value: "alle", label: "Alle" },
];

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

function scoreTone(total: number | null) {
  if (total == null) return "text-text-dim";
  if (total >= 70) return "text-danger";
  if (total >= 55) return "text-text";
  return "text-text-muted";
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

function BadgeRow({ a }: { a: Artist }) {
  if (a.homeGigCount <= 0 && a.badges.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <HomeLine a={a} />
      {a.badges.map((b) => (
        <RadarBadge key={b} id={b} />
      ))}
    </div>
  );
}

export function ArtistsWorkbench({
  initial,
  total,
  page,
  pageSize,
  spotifyReady,
  badgeCounts,
  thCounts,
}: {
  initial: Artist[];
  total: number;
  page: number;
  pageSize: number;
  spotifyReady: boolean;
  badgeCounts?: Partial<Record<RadarBadgeId, number>>;
  thCounts?: Partial<Record<RadarThuishavenFilter, number>>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const status = (searchParams.get("status") as "all" | RadarArtistStatus) || "all";
  const sort = searchParams.get("sort") || "score";
  const th = parseThuishavenFilter(
    searchParams.get("th"),
    searchParams.get("nieuw"),
  );
  const active = parseBadgeFilter(searchParams.get("f"));
  const activeCount = active.include.length + active.exclude.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rankOffset = (page - 1) * pageSize;
  const showRank = sort !== "name" && sort !== "newest";

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

  function replaceParams(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => router.replace(`?${params.toString()}`));
  }

  function setParam(key: string, value: string | null) {
    replaceParams((params) => {
      if (value == null || value === "" || value === "all") params.delete(key);
      else params.set(key, value);
      if (key !== "page") params.delete("page");
    });
  }

  function setBadges(next: RadarBadgeFilter, sortOverride?: string) {
    replaceParams((params) => {
      const s = serializeBadgeFilter(next);
      if (s) params.set("f", s);
      else params.delete("f");
      if (sortOverride) params.set("sort", sortOverride);
      params.delete("page");
    });
  }

  /** Cycle: off → include → exclude → off. */
  function cycleBadge(id: RadarBadgeId) {
    const include = active.include.filter((b) => b !== id);
    const exclude = active.exclude.filter((b) => b !== id);
    if (active.include.includes(id)) exclude.push(id);
    else if (!active.exclude.includes(id)) include.push(id);
    setBadges({ include, exclude });
  }

  const EMPTY: RadarBadgeFilter = { include: [], exclude: [] };

  function setTh(value: RadarThuishavenFilter) {
    replaceParams((params) => {
      params.delete("nieuw");
      if (value === "nieuw") params.delete("th");
      else params.set("th", value);
      params.delete("page");
    });
  }

  function refresh() {
    startTransition(() => router.refresh());
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

  const presetActive = (p: (typeof PRESETS)[number]) =>
    sameFilter(p.filter, active);

  return (
    <div className="space-y-4">
      {/* Thuishaven segment */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Thuishaven"
          className="inline-flex border border-border"
        >
          {TH_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={th === o.value}
              onClick={() => setTh(o.value)}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                th === o.value
                  ? "bg-accent text-accent-contrast"
                  : "text-text-muted hover:bg-surface-hover hover:text-text",
              )}
            >
              {o.label}
              {thCounts?.[o.value] != null ? (
                <span className="ml-1.5 tabular-nums opacity-70">
                  {fmtCompact(thCounts[o.value])}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <RadarInfoTip topic="nieuw" />
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="border border-border px-3 py-1.5 text-sm hover:border-accent"
          >
            + Artiest
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const on = presetActive(p);
          return (
            <button
              key={p.label}
              type="button"
              title={p.hint}
              onClick={() => (on ? setBadges(EMPTY) : setBadges(p.filter, p.sort))}
              className={cn(
                "border px-3 py-1.5 text-sm transition-colors",
                on
                  ? "border-accent bg-accent-soft text-text"
                  : "border-border bg-surface text-text-muted hover:border-accent hover:text-text",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Badge chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RADAR_BADGES.map((b) => {
          const on = active.include.includes(b.id);
          const off = active.exclude.includes(b.id);
          const count = badgeCounts?.[b.id];
          return (
            <button
              key={b.id}
              type="button"
              title={`${b.hint}\nKlik: alleen deze · nogmaals: uitsluiten · nogmaals: uit`}
              onClick={() => cycleBadge(b.id)}
              disabled={!on && !off && count === 0}
              className={cn(
                "inline-flex items-center gap-1.5 border px-2 py-1 text-xs transition-colors disabled:opacity-35",
                on && "border-text bg-text text-bg",
                off && "border-danger text-danger line-through",
                !on &&
                  !off &&
                  "border-border text-text-muted hover:border-text hover:text-text",
              )}
            >
              {off ? "zonder " : ""}
              {b.label}
              {count != null && !off ? (
                <span className="tabular-nums opacity-60 no-underline">
                  {fmtCompact(count)}
                </span>
              ) : null}
            </button>
          );
        })}
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => setBadges(EMPTY)}
            className="px-2 py-1 text-xs text-text-dim underline hover:text-text"
          >
            Wis filters
          </button>
        ) : null}
      </div>

      {/* Search / status / sort */}
      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="sr-only">Zoeken</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek artiest…"
            className="w-full border border-border bg-surface px-2 py-2"
          />
        </label>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="border border-border bg-surface px-2 py-2 text-sm"
        >
          <option value="all">Alle statussen</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {RADAR_ARTIST_STATUS_NL[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Sorteren"
          value={sort}
          onChange={(e) => setParam("sort", e.target.value)}
          className="border border-border bg-surface px-2 py-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sorteer: {s.label}
            </option>
          ))}
        </select>
        <p className="pb-2 text-xs text-text-muted">
          {total.toLocaleString("nl-NL")} resultaten
          {pending ? " · laden…" : ""}
        </p>
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
            className="border border-accent bg-accent px-3 py-2 text-sm text-accent-contrast"
          >
            Toevoegen
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-warn">{error}</p> : null}

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {initial.length === 0 ? (
          <li className="border border-dashed border-border px-3 py-8 text-center text-sm text-text-muted">
            Geen artiesten in deze filter.
          </li>
        ) : (
          initial.map((a, i) => {
            const total = num(a.growthScore);
            return (
              <li
                key={a.id}
                className={cn(
                  "border border-border bg-surface p-3",
                  a.homeGigCount > 0 && "border-l-2 border-l-accent",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/radar/artiesten/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {showRank ? (
                        <span className="mr-1.5 text-text-dim tabular-nums">
                          #{rankOffset + i + 1}
                        </span>
                      ) : null}
                      {a.name}
                    </Link>
                    <BadgeRow a={a} />
                    <p className="mt-1 line-clamp-1 text-[11px] text-text-dim">
                      {a.scoreReasons?.[0] ?? a.discoverySource}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "font-display text-2xl tabular-nums",
                        scoreTone(total),
                      )}
                    >
                      {a.growthScore ? Math.round(Number(a.growthScore)) : "—"}
                    </span>
                    <RadarScoreBars
                      momentum={num(a.momentumScore)}
                      fit={num(a.fitScore)}
                      bookability={num(a.bookabilityScore)}
                    />
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto border border-border md:block">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.12em] text-text-dim uppercase">
              {showRank ? (
                <th className="w-10 px-3 py-2 text-right font-medium">#</th>
              ) : null}
              <th className="px-3 py-2 font-medium">Artiest</th>
              <th className="px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Score
                  <RadarInfoTip topic="totaal" />
                </span>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  NL
                  <RadarInfoTip topic="nl-audience" align="end" />
                </span>
              </th>
              <th className="px-3 py-2 text-right font-medium">RA</th>
              <th className="px-3 py-2 text-right font-medium">Set-views</th>
              <th className="px-3 py-2 font-medium">Land</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 ? (
              <tr>
                <td
                  colSpan={showRank ? 8 : 7}
                  className="px-3 py-10 text-center text-text-muted"
                >
                  Geen artiesten in deze filter.
                </td>
              </tr>
            ) : (
              initial.map((a, i) => {
                const total = num(a.growthScore);
                return (
                  <tr
                    key={a.id}
                    className={cn(
                      "border-b border-border/70 align-top hover:bg-surface-hover",
                      a.homeGigCount > 0 && "bg-accent-soft/30",
                    )}
                  >
                    {showRank ? (
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-text-dim tabular-nums">
                        {rankOffset + i + 1}
                      </td>
                    ) : null}
                    <td className="max-w-[26rem] px-3 py-2.5">
                      <Link
                        href={`/radar/artiesten/${a.id}`}
                        className="font-medium hover:underline"
                      >
                        {a.name}
                      </Link>
                      <BadgeRow a={a} />
                      <p className="mt-1 line-clamp-1 text-[11px] text-text-dim">
                        {a.scoreReasons?.[0] ?? a.discoverySource}
                        {a.primaryGenre ? ` · ${a.primaryGenre}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "w-8 font-display text-2xl tabular-nums",
                            scoreTone(total),
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
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">
                      {a.nlAudienceScore != null
                        ? Math.round(Number(a.nlAudienceScore))
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">
                      {fmtNum(a.raFollowerCount)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">
                      {fmtCompact(a.topMixseriesViews)}
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">
                      {a.residentCountry ?? a.country ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={a.status}
                        disabled={busyId === a.id}
                        onChange={(e) =>
                          setArtistStatus(a.id, e.target.value as RadarArtistStatus)
                        }
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
                );
              })
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
