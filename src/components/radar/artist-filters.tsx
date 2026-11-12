"use client";

import { Plus, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { RadarInfoTip } from "@/components/radar/radar-info-tip";
import {
  RADAR_BADGES,
  RADAR_BADGE_BY_ID,
  RADAR_BADGE_GROUP_NL,
  RADAR_PRESETS,
  parseBadgeFilter,
  parseThuishavenFilter,
  sameBadgeFilter,
  serializeBadgeFilter,
  type RadarBadgeFilter,
  type RadarBadgeGroup,
  type RadarBadgeId,
  type RadarPresetId,
  type RadarThuishavenFilter,
} from "@/lib/radar/badge-defs";
import { RADAR_ARTIST_STATUS_NL, type RadarArtistStatus } from "@/lib/radar/types";
import { cn } from "@/lib/utils";

const STATUSES = Object.keys(RADAR_ARTIST_STATUS_NL) as RadarArtistStatus[];

const SORTS = [
  { value: "score", label: "Totaalscore" },
  { value: "momentum", label: "Momentum" },
  { value: "fit", label: "Fit" },
  { value: "bookability", label: "Bookable" },
  { value: "nl", label: "NL-audience" },
  { value: "ra_followers", label: "RA-volgers" },
  { value: "newest", label: "Nieuwst op radar" },
  { value: "name", label: "Naam A–Z" },
] as const;

const TH_OPTIONS: Array<{ value: RadarThuishavenFilter; label: string; hint: string }> = [
  { value: "nieuw", label: "Nieuw voor TH", hint: "Nog nooit bij Thuishaven gespeeld" },
  { value: "gespeeld", label: "Al bij TH", hint: "Speelde al bij Thuishaven" },
  { value: "alle", label: "Alle", hint: "Iedereen op de radar" },
];

const EMPTY: RadarBadgeFilter = { include: [], exclude: [] };

function fmtCompact(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function ArtistFilters({
  total,
  badgeCounts,
  presetCounts,
  thCounts,
}: {
  total: number;
  badgeCounts?: Partial<Record<RadarBadgeId, number>>;
  presetCounts?: Partial<Record<RadarPresetId, number>>;
  thCounts?: Partial<Record<RadarThuishavenFilter, number>>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const urlQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ);
    setQ(urlQ);
  }

  const status = (searchParams.get("status") as "all" | RadarArtistStatus) || "all";
  const sort = searchParams.get("sort") || "score";
  const th = parseThuishavenFilter(searchParams.get("th"), searchParams.get("nieuw"));
  const active = parseBadgeFilter(searchParams.get("f"));
  const activeCount = active.include.length + active.exclude.length;
  const hasAnything =
    activeCount > 0 || status !== "all" || Boolean(urlQ) || th !== "nieuw";

  function replace(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    startTransition(() => router.replace(`?${params.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      if (q.trim() === urlQ) return;
      replace((p) => {
        if (q.trim()) p.set("q", q.trim());
        else p.delete("q");
      });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function setFilter(next: RadarBadgeFilter, sortOverride?: string) {
    replace((p) => {
      const s = serializeBadgeFilter(next);
      if (s) p.set("f", s);
      else p.delete("f");
      if (sortOverride) p.set("sort", sortOverride);
    });
  }

  function setBadgeMode(id: RadarBadgeId, mode: "wel" | "niet" | null) {
    const include = active.include.filter((b) => b !== id);
    const exclude = active.exclude.filter((b) => b !== id);
    if (mode === "wel") include.push(id);
    if (mode === "niet") exclude.push(id);
    setFilter({ include, exclude });
  }

  function setParam(key: string, value: string | null) {
    replace((p) => {
      if (!value || value === "all") p.delete(key);
      else p.set(key, value);
    });
  }

  function setTh(value: RadarThuishavenFilter) {
    replace((p) => {
      p.delete("nieuw");
      if (value === "nieuw") p.delete("th");
      else p.set("th", value);
    });
  }

  function resetAll() {
    setQ("");
    startTransition(() => router.replace("?", { scroll: false }));
  }

  const activePreset = RADAR_PRESETS.find((p) => sameBadgeFilter(p.filter, active));

  return (
    <section className="border border-border bg-surface">
      {/* 1 — zoeken + Thuishaven */}
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Zoek artiest</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-dim"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek op artiestnaam…"
            className="w-full border border-border bg-bg py-2.5 pr-9 pl-9 text-sm focus:border-text focus:outline-none"
          />
          {q ? (
            <button
              type="button"
              aria-label="Zoekterm wissen"
              onClick={() => setQ("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-text-dim hover:text-text"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </label>

        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Thuishaven"
            className="grid flex-1 grid-cols-3 border border-border bg-bg p-0.5 lg:flex-none"
          >
            {TH_OPTIONS.map((o) => {
              const on = th === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={o.hint}
                  onClick={() => setTh(o.value)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                    on ? "bg-text font-medium text-bg" : "text-text-muted hover:text-text",
                  )}
                >
                  {o.label}
                  {thCounts?.[o.value] != null ? (
                    <span className={cn("text-xs tabular-nums", on ? "opacity-70" : "text-text-dim")}>
                      {fmtCompact(thCounts[o.value])}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <RadarInfoTip topic="nieuw" align="end" />
        </div>
      </div>

      {/* 2 — snelle selecties */}
      <div className="border-t border-border px-4 pt-3 pb-4">
        <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
          Snel starten
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {RADAR_PRESETS.map((p) => {
            const on = activePreset?.id === p.id;
            const count = presetCounts?.[p.id];
            const empty = count === 0 && !on;
            return (
              <button
                key={p.id}
                type="button"
                disabled={empty}
                onClick={() => (on ? setFilter(EMPTY) : setFilter(p.filter, p.sort))}
                className={cn(
                  "group flex flex-col items-start border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  on
                    ? "border-text bg-text text-bg"
                    : "border-border bg-bg hover:border-text",
                )}
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{p.label}</span>
                  <span
                    className={cn(
                      "font-display text-lg leading-none tabular-nums",
                      on ? "text-bg" : "text-text",
                    )}
                  >
                    {fmtCompact(count)}
                  </span>
                </span>
                <span className={cn("mt-0.5 text-xs", on ? "text-bg/70" : "text-text-muted")}>
                  {p.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3 — filters, status, sortering */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <div ref={popRef} className="relative">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 border px-3 py-2 text-sm font-medium transition-colors",
              open ? "border-text bg-text text-bg" : "border-text bg-bg hover:bg-surface-hover",
            )}
          >
            <Plus className="size-4" />
            Filter
            {activeCount > 0 ? (
              <span className="ml-0.5 bg-highlight px-1.5 text-xs text-highlight-fg tabular-nums">
                {activeCount}
              </span>
            ) : null}
          </button>
          {open ? (
            <FilterPopover
              active={active}
              badgeCounts={badgeCounts}
              onSet={setBadgeMode}
              onClear={() => setFilter(EMPTY)}
            />
          ) : null}
        </div>

        {active.include.map((id) => (
          <ActivePill key={`i-${id}`} id={id} mode="wel" onRemove={() => setBadgeMode(id, null)} />
        ))}
        {active.exclude.map((id) => (
          <ActivePill key={`e-${id}`} id={id} mode="niet" onRemove={() => setBadgeMode(id, null)} />
        ))}
        {activeCount === 0 ? (
          <span className="text-xs text-text-dim">
            Geen extra filters — kies een snelle start of voeg een filter toe.
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Status
            <select
              value={status}
              onChange={(e) => setParam("status", e.target.value)}
              className="border border-border bg-bg px-2 py-1.5 text-sm text-text"
            >
              <option value="all">Alle</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RADAR_ARTIST_STATUS_NL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Sorteer
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value === "score" ? null : e.target.value)}
              className="border border-border bg-bg px-2 py-1.5 text-sm text-text"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 4 — resultaat */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-bg-elevated/50 px-4 py-2.5"
        aria-live="polite"
      >
        <p className="text-sm text-text-muted">
          <span className="font-display text-xl text-text tabular-nums">
            {total.toLocaleString("nl-NL")}
          </span>{" "}
          {total === 1 ? "artiest" : "artiesten"}
          {activePreset ? (
            <>
              {" "}· <span className="text-text">{activePreset.label}</span>
            </>
          ) : null}
          {pending ? <span className="ml-2 text-xs text-text-dim">laden…</span> : null}
        </p>
        {hasAnything ? (
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-text-muted underline hover:text-text"
          >
            Alles wissen
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ActivePill({
  id,
  mode,
  onRemove,
}: {
  id: RadarBadgeId;
  mode: "wel" | "niet";
  onRemove: () => void;
}) {
  const def = RADAR_BADGE_BY_ID.get(id);
  if (!def) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 py-1 pr-1 pl-2.5 text-sm",
        mode === "wel" ? "bg-text text-bg" : "border border-danger bg-danger-soft text-danger",
      )}
    >
      {mode === "niet" ? <span className="text-xs font-medium uppercase">Niet</span> : null}
      {def.label}
      <button
        type="button"
        aria-label={`Filter ${def.label} verwijderen`}
        onClick={onRemove}
        className="ml-0.5 p-0.5 opacity-70 hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function FilterPopover({
  active,
  badgeCounts,
  onSet,
  onClear,
}: {
  active: RadarBadgeFilter;
  badgeCounts?: Partial<Record<RadarBadgeId, number>>;
  onSet: (id: RadarBadgeId, mode: "wel" | "niet" | null) => void;
  onClear: () => void;
}) {
  const groups = Object.keys(RADAR_BADGE_GROUP_NL) as RadarBadgeGroup[];
  return (
    <div
      role="dialog"
      aria-label="Filters"
      className="absolute top-full left-0 z-30 mt-1 w-[min(34rem,calc(100vw-2rem))] border border-text bg-surface shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-medium">Filter op signaal</p>
        <p className="text-xs text-text-dim">
          <span className="font-medium text-text">Wel</span> = moet erin ·{" "}
          <span className="font-medium text-danger">Niet</span> = uitsluiten
        </p>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {groups.map((g) => (
          <div key={g} className="border-b border-border/70 px-4 py-3 last:border-b-0">
            <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
              {RADAR_BADGE_GROUP_NL[g]}
            </p>
            <ul className="space-y-1">
              {RADAR_BADGES.filter((b) => b.group === g).map((b) => {
                const mode = active.include.includes(b.id)
                  ? "wel"
                  : active.exclude.includes(b.id)
                    ? "niet"
                    : null;
                const count = badgeCounts?.[b.id];
                return (
                  <li key={b.id} className="flex items-center gap-3 py-1">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2 text-sm">
                        <span className={cn(mode && "font-medium")}>{b.label}</span>
                        <span className="text-xs text-text-dim tabular-nums">
                          {fmtCompact(count)}
                        </span>
                      </p>
                      <p className="text-xs leading-snug text-text-muted">{b.hint}</p>
                    </div>
                    <div className="flex shrink-0 border border-border">
                      <button
                        type="button"
                        aria-pressed={mode === "wel"}
                        disabled={count === 0 && mode !== "wel"}
                        onClick={() => onSet(b.id, mode === "wel" ? null : "wel")}
                        className={cn(
                          "px-2.5 py-1 text-xs transition-colors disabled:opacity-30",
                          mode === "wel" ? "bg-text text-bg" : "hover:bg-surface-hover",
                        )}
                      >
                        Wel
                      </button>
                      <button
                        type="button"
                        aria-pressed={mode === "niet"}
                        onClick={() => onSet(b.id, mode === "niet" ? null : "niet")}
                        className={cn(
                          "border-l border-border px-2.5 py-1 text-xs transition-colors",
                          mode === "niet"
                            ? "bg-danger text-white"
                            : "hover:bg-surface-hover",
                        )}
                      >
                        Niet
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-border px-4 py-2">
        <button type="button" onClick={onClear} className="text-xs text-text-muted underline hover:text-text">
          Filters wissen
        </button>
      </div>
    </div>
  );
}
