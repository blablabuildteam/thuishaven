"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { DjFeeAmountInput } from "@/components/dashboard/dj-fee-amount-input";
import { DjFeesExport } from "@/components/dashboard/dj-fees-export";
import {
  addDjFeeToSpend,
  countMissingDjFees,
  emptyDjFeeSpend,
  eventNeedsDjFees,
  formatDjFeeSpend,
  monthKeyFromDay,
  monthLabelFromDay,
  monthNameFromDay,
  notifyDjFeesChanged,
  type DjFeeArtistView,
  type DjFeeEventView,
  type DjFeeSpend,
} from "@/lib/dashboard/dj-fee-ranges";
import { displayEditionName } from "@/lib/editions/lineup";
import { cn } from "@/lib/utils";

/**
 * Fixed control columns (fee · 10HRS · remove) so they line up across every
 * event ticket. Below `sm` the row stacks: name on top, controls underneath.
 */
const DJ_FEE_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_12rem_5.5rem_2.25rem] sm:gap-x-4";

function spendFor(artists: DjFeeArtistView[]): DjFeeSpend {
  const spend = emptyDjFeeSpend();
  for (const artist of artists) addDjFeeToSpend(spend, artist);
  return spend;
}

function eventMissingCount(event: DjFeeEventView): number {
  return countMissingDjFees(event.artists);
}

function eventNeedsFees(event: DjFeeEventView): boolean {
  return eventNeedsDjFees(event.artists);
}

function sourceLabel(source: DjFeeArtistView["source"]): string | null {
  if (source === "resident_advisor") return "RA";
  if (source === "custom") return "Handmatig";
  return null;
}

function stubParts(dayIso: string) {
  const d = new Date(`${dayIso}T12:00:00.000Z`);
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("nl-NL", { ...opts, timeZone: "UTC" })
      .format(d)
      .replace(".", "");
  return {
    weekday: fmt({ weekday: "short" }),
    day: fmt({ day: "numeric" }),
    month: fmt({ month: "short" }),
    year: fmt({ year: "numeric" }),
  };
}

function PendingDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} event${count === 1 ? "" : "s"} zonder complete DJ-fees`}
      className="th-sticker inline-flex h-4 min-w-4 items-center justify-center bg-highlight px-1 text-[10px] text-black tabular-nums"
    >
      {count}
    </span>
  );
}

/** Stamp-style toggle: outlined when off, filled when it was a 10-hour set. */
function TenHourToggle({
  value,
  disabled,
  onToggle,
}: {
  value: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label="10HRS-set"
      title={value ? "10HRS-set — klik om uit te zetten" : "Geen 10HRS-set — klik om aan te zetten"}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "th-sticker inline-flex h-8 w-full items-center justify-center gap-1 border-[1.5px] px-2 text-xs transition-colors",
        value
          ? "border-border-strong bg-accent text-accent-contrast"
          : "border-dashed border-border text-text-dim hover:border-border-strong hover:text-text",
        disabled && "opacity-60",
      )}
    >
      {value && <Check className="size-3" strokeWidth={3} aria-hidden />}
      10HRS
    </button>
  );
}

export function DjFeesWorkbench({
  initialEvents,
  initialMonth,
  focusEditionId,
}: {
  initialEvents: DjFeeEventView[];
  initialMonth: string;
  focusEditionId?: string;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [month, setMonth] = useState(initialMonth);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const months = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      const key = monthKeyFromDay(event.day);
      if (!map.has(key)) map.set(key, event.day);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, day]) => ({
        key,
        year: key.slice(0, 4),
        label: monthNameFromDay(day),
        fullLabel: monthLabelFromDay(day),
      }));
  }, [events]);

  const years = useMemo(
    () => [...new Set(months.map((item) => item.year))].reverse(),
    [months],
  );

  const selectedYear = month.slice(0, 4);
  const monthsInYear = useMemo(
    () => months.filter((item) => item.year === selectedYear),
    [months, selectedYear],
  );

  const pendingByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      if (!eventNeedsFees(event)) continue;
      const key = monthKeyFromDay(event.day);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const pendingByYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, count] of pendingByMonth) {
      const year = key.slice(0, 4);
      map.set(year, (map.get(year) ?? 0) + count);
    }
    return map;
  }, [pendingByMonth]);

  useEffect(() => {
    const selected = document.querySelector<HTMLElement>(
      '[data-dj-fee-month][aria-selected="true"]',
    );
    selected?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [month]);

  useEffect(() => {
    if (!focusEditionId) return;
    document
      .getElementById(`dj-fee-${focusEditionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusEditionId, month]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      if (!q && monthKeyFromDay(event.day) !== month) return false;
      if (!q) return true;
      const hay = [
        event.name,
        displayEditionName(event.name),
        ...event.artists.map((a) => a.name),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [events, month, query]);

  const monthSpend = useMemo(() => {
    const spend = emptyDjFeeSpend();
    for (const event of filtered) {
      spend.min += event.spend.min;
      spend.max += event.spend.max;
      spend.priced += event.spend.priced;
      spend.ranged += event.spend.ranged;
      spend.missing += event.spend.missing;
      if (event.spend.openEnded) spend.openEnded = true;
    }
    return spend;
  }, [filtered]);

  function replaceArtist(
    editionId: string,
    artistId: string,
    next: DjFeeArtistView | null,
  ) {
    setEvents((current) =>
      current.map((event) => {
        if (event.id !== editionId) return event;
        const artists = next
          ? event.artists.map((a) => (a.id === artistId ? next : a))
          : event.artists.filter((a) => a.id !== artistId);
        return { ...event, artists, spend: spendFor(artists) };
      }),
    );
  }

  function appendArtist(editionId: string, artist: DjFeeArtistView) {
    setEvents((current) =>
      current.map((event) => {
        if (event.id !== editionId) return event;
        if (event.artists.some((a) => a.id === artist.id)) {
          const artists = event.artists.map((a) =>
            a.id === artist.id ? artist : a,
          );
          return { ...event, artists, spend: spendFor(artists) };
        }
        const artists = [...event.artists, artist];
        return { ...event, artists, spend: spendFor(artists) };
      }),
    );
  }

  async function patchArtist(
    editionId: string,
    artist: DjFeeArtistView,
    body: { feeAmount?: number | null; isTenHour?: boolean },
  ) {
    const previous = artist;
    const optimistic: DjFeeArtistView = {
      ...artist,
      ...body,
      ...(body.feeAmount !== undefined ? { feeRange: null } : {}),
    };
    replaceArtist(editionId, artist.id, optimistic);
    setBusyId(artist.id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/dj-fees/${artist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        artist?: DjFeeArtistView;
      };
      if (!res.ok || !data.artist) {
        replaceArtist(editionId, artist.id, previous);
        setError(data.error ?? "Opslaan mislukt");
        return;
      }
      replaceArtist(editionId, artist.id, data.artist);
      notifyDjFeesChanged();
    } catch {
      replaceArtist(editionId, artist.id, previous);
      setError("Opslaan mislukt");
    } finally {
      setBusyId(null);
    }
  }

  async function removeArtist(editionId: string, artist: DjFeeArtistView) {
    const previous = artist;
    replaceArtist(editionId, artist.id, null);
    setBusyId(artist.id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/dj-fees/${artist.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        appendArtist(editionId, previous);
        setError(data.error ?? "Verwijderen mislukt");
      } else {
        notifyDjFeesChanged();
      }
    } catch {
      appendArtist(editionId, previous);
      setError("Verwijderen mislukt");
    } finally {
      setBusyId(null);
    }
  }

  async function addArtist(editionId: string, name: string) {
    setBusyId(editionId);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/dj-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId, name }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        artist?: DjFeeArtistView;
      };
      if (!res.ok || !data.artist) {
        setError(data.error ?? "Toevoegen mislukt");
        return false;
      }
      appendArtist(editionId, data.artist);
      notifyDjFeesChanged();
      return true;
    } catch {
      setError("Toevoegen mislukt");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const searching = query.trim().length > 0;
  const activeMonth = months.find((item) => item.key === month);
  const djCount = monthSpend.priced + monthSpend.missing;

  return (
    <div className="space-y-6">
      {/* Poster band — title + the two numbers that matter */}
      <section className="th-poster-band border-[1.5px] border-border-strong">
        <div className="grid gap-6 px-5 pt-6 pb-5 sm:px-8 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="th-sticker text-xs opacity-60">Alerts · Line-up kosten</p>
            <h1 className="th-poster-title mt-2 text-6xl sm:text-8xl">DJ-fees</h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed opacity-70">
              Fee per DJ in hele euro&apos;s, plus of het een 10HRS-set was.
              Line-up komt uit Resident Advisor; voeg zelf DJs toe of haal ze
              weg. Oude ranges tellen mee tot je het bedrag invult.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px self-end bg-accent-contrast/20 sm:min-w-[26rem]">
            <div className="bg-accent px-4 py-3 sm:px-5">
              <dt className="th-sticker text-[11px] opacity-60">
                {searching
                  ? "Gevonden spend"
                  : `Spend ${activeMonth?.label ?? "maand"}`}
              </dt>
              <dd className="th-num mt-1 text-3xl leading-none sm:text-5xl">
                {formatDjFeeSpend(monthSpend)}
              </dd>
              <dd className="mt-2 text-xs opacity-60">
                {monthSpend.priced === 0
                  ? "Nog geen fees ingevuld"
                  : `${monthSpend.priced} DJ${monthSpend.priced === 1 ? "" : "s"} met fee${monthSpend.ranged > 0 ? ` · ${monthSpend.ranged} nog als range` : ""}`}
              </dd>
            </div>
            <div className="bg-accent px-4 py-3 sm:px-5">
              <dt className="th-sticker text-[11px] opacity-60">Nog in te vullen</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span
                  className={cn(
                    "th-num text-3xl leading-none sm:text-5xl",
                    monthSpend.missing > 0 && "bg-highlight px-1.5 text-black",
                  )}
                >
                  {monthSpend.missing}
                </span>
                <span className="th-num text-xl opacity-50">/ {djCount}</span>
              </dd>
              <dd className="mt-2 text-xs opacity-60">
                {monthSpend.missing === 0 && djCount > 0
                  ? "Alles ingevuld"
                  : "DJs zonder fee"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Agenda strip — year, months, search, export */}
      <div className="border-[1.5px] border-border-strong bg-surface">
        <div className="flex flex-col gap-3 border-b-[1.5px] border-border-strong p-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex shrink-0 gap-px self-start border-[1.5px] border-border-strong bg-border-strong"
            role="tablist"
            aria-label="Jaar"
            hidden={searching || months.length === 0}
          >
            {years.map((year) => {
              const pending = pendingByYear.get(year) ?? 0;
              const active = selectedYear === year;
              return (
                <button
                  key={year}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    if (active) return;
                    const preferred = `${year}-${month.slice(5, 7)}`;
                    const match = months.find((item) => item.key === preferred);
                    const first = months.find((item) => item.year === year);
                    if (match) setMonth(match.key);
                    else if (first) setMonth(first.key);
                  }}
                  className={cn(
                    "th-sticker inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-contrast"
                      : "bg-surface text-text-muted hover:text-text",
                  )}
                >
                  {year}
                  <PendingDot count={pending} />
                </button>
              );
            })}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-dim"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op event of DJ…"
                aria-label="Zoek op event of DJ"
                className="w-full border-[1.5px] border-border bg-bg py-2 pr-3 pl-10 text-sm outline-none focus:border-border-strong"
              />
            </div>
            <DjFeesExport events={events} initialMonth={month} />
          </div>
        </div>

        {searching ? (
          <p className="px-4 py-3 text-sm text-text-muted">
            <span className="th-num text-base text-text">{filtered.length}</span>{" "}
            event{filtered.length === 1 ? "" : "s"} voor “{query.trim()}” — over
            alle maanden.
          </p>
        ) : (
          months.length > 0 && (
            <div
              className="flex overflow-x-auto"
              role="tablist"
              aria-label="Maand"
            >
              {monthsInYear.map((item) => {
                const pending = pendingByMonth.get(item.key) ?? 0;
                const active = month === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    data-dj-fee-month=""
                    aria-selected={active}
                    onClick={() => setMonth(item.key)}
                    className={cn(
                      "group relative flex min-w-[5.5rem] shrink-0 flex-1 flex-col items-start gap-1 border-r border-border px-3 pt-2.5 pb-3 text-left transition-colors last:border-r-0",
                      active
                        ? "bg-accent text-accent-contrast"
                        : "text-text-muted hover:bg-surface-hover hover:text-text",
                    )}
                  >
                    <span className="th-sticker text-[10px] opacity-60">
                      {item.key.slice(5, 7)}
                    </span>
                    <span className="th-poster-title text-2xl capitalize">
                      {item.label.slice(0, 3)}
                    </span>
                    <span className="absolute top-2 right-2">
                      <PendingDot count={pending} />
                    </span>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {error && (
        <p className="border-[1.5px] border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="border-[1.5px] border-dashed border-border px-4 py-10 text-center">
          <p className="th-poster-title text-3xl text-text-dim">Leeg</p>
          <p className="mt-2 text-sm text-text-muted">
            {searching
              ? `Geen events of DJs gevonden voor “${query.trim()}”.`
              : "Geen events in deze maand."}
          </p>
        </div>
      ) : (
        <div className="space-y-5 pr-1 pb-1">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              showYear={searching}
              focused={event.id === focusEditionId}
              busyId={busyId}
              onFeeChange={(artist, feeAmount) =>
                void patchArtist(event.id, artist, { feeAmount })
              }
              onTenHourToggle={(artist) =>
                void patchArtist(event.id, artist, {
                  isTenHour: !artist.isTenHour,
                })
              }
              onRemove={(artist) => void removeArtist(event.id, artist)}
              onAdd={(name) => addArtist(event.id, name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  showYear,
  focused,
  busyId,
  onFeeChange,
  onTenHourToggle,
  onRemove,
  onAdd,
}: {
  event: DjFeeEventView;
  showYear?: boolean;
  focused?: boolean;
  busyId: string | null;
  onFeeChange: (artist: DjFeeArtistView, feeAmount: number | null) => void;
  onTenHourToggle: (artist: DjFeeArtistView) => void;
  onRemove: (artist: DjFeeArtistView) => void;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const adding = busyId === event.id;
  const stub = stubParts(event.day);
  const missing = eventMissingCount(event);
  const total = event.artists.length;
  const done = total - missing;
  const complete = total > 0 && !eventNeedsFees(event);
  const sourceHint =
    event.artistsSource === "resident_advisor"
      ? "Line-up uit Resident Advisor"
      : event.artistsSource === "edition_name"
        ? "Line-up uit eventnaam"
        : "Nog geen line-up — voeg DJs zelf toe";

  return (
    <article
      id={`dj-fee-${event.id}`}
      data-focused={focused ? "true" : undefined}
      className="th-ticket grid scroll-mt-24 grid-cols-1 sm:grid-cols-[6.5rem_minmax(0,1fr)]"
    >
      {/* Stub: the date, poster style */}
      <div className="th-ticket-stub">
        <div className="flex items-baseline gap-3 px-4 py-3 sm:sticky sm:top-6 sm:flex-col sm:items-center sm:gap-0 sm:px-2 sm:py-5 sm:text-center">
          <span className="th-sticker text-xs opacity-70">{stub.weekday}</span>
          <span className="th-poster-title text-4xl sm:mt-1 sm:text-6xl">{stub.day}</span>
          <span className="th-sticker text-sm sm:mt-1">
            {stub.month}
            {showYear && <span className="opacity-60"> ’{stub.year.slice(2)}</span>}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="th-poster-title text-2xl leading-[0.95] break-words text-text sm:text-3xl">
              {displayEditionName(event.name)}
            </h2>
            <p className="mt-1.5 text-xs text-text-dim">{sourceHint}</p>
          </div>
          <div className="flex items-center gap-3">
            {complete ? (
              <span className="th-sticker inline-flex items-center gap-1 border-[1.5px] border-success px-2 py-1 text-[11px] text-success">
                <Check className="size-3" strokeWidth={3} aria-hidden />
                Compleet
              </span>
            ) : missing > 0 ? (
              <span className="th-sticker -rotate-2 bg-highlight px-2 py-1 text-[11px] text-black">
                {missing} open
              </span>
            ) : null}
            <span className="th-num text-3xl leading-none text-text">
              {formatDjFeeSpend(event.spend)}
            </span>
          </div>
        </header>

        {/* Progress: how many of the line-up have a fee */}
        {total > 0 && (
          <div className="flex items-center gap-3 px-4 pb-3 sm:px-5">
            <div className="h-1 flex-1 bg-border/60" aria-hidden>
              <div
                className="h-full bg-text transition-[width] duration-300"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-text-dim tabular-nums">
              {done}/{total} ingevuld
            </span>
          </div>
        )}

        <div
          className={cn(
            DJ_FEE_GRID,
            "hidden border-t-[1.5px] border-border-strong px-4 py-1.5 sm:grid sm:px-5",
          )}
        >
          <span className="th-sticker text-[11px] text-text-dim">DJ</span>
          <span className="th-sticker text-[11px] text-text-dim">Fee</span>
          <span className="th-sticker text-center text-[11px] text-text-dim">Set</span>
          <span className="sr-only">Acties</span>
        </div>

        {total === 0 && (
          <p className="border-t border-border px-4 py-4 text-sm text-text-muted sm:px-5">
            Nog geen DJs op dit event.
          </p>
        )}

        <ul>
          {event.artists.map((artist) => {
            const hint = sourceLabel(artist.source);
            const busy = busyId === artist.id;
            return (
              <li
                key={artist.id}
                className={cn(
                  DJ_FEE_GRID,
                  "group border-t border-border px-4 py-2.5 transition-colors hover:bg-surface-hover sm:px-5",
                )}
              >
                <div className="col-span-3 flex min-w-0 items-baseline gap-2 sm:col-span-1">
                  <span className="th-sticker truncate text-lg tracking-[0.03em] text-text">
                    {artist.name}
                  </span>
                  {hint && (
                    <span className="shrink-0 border border-border px-1 py-px text-[9px] font-semibold tracking-[0.1em] text-text-dim uppercase">
                      {hint}
                    </span>
                  )}
                </div>
                <DjFeeAmountInput
                  value={artist.feeAmount}
                  legacyRange={artist.feeRange}
                  disabled={busy}
                  label={`Fee voor ${artist.name}`}
                  onChange={(feeAmount) => onFeeChange(artist, feeAmount)}
                />
                <TenHourToggle
                  value={artist.isTenHour}
                  disabled={busy}
                  onToggle={() => onTenHourToggle(artist)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(artist)}
                  title={`${artist.name} verwijderen`}
                  aria-label={`${artist.name} verwijderen`}
                  className="inline-flex size-8 items-center justify-center justify-self-end text-text-dim transition-[color,opacity] hover:text-danger focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>

        <form
          className="flex gap-2 border-t-[1.5px] border-dashed border-border px-4 py-3 sm:px-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = draft.trim();
            if (!name) return;
            const ok = await onAdd(name);
            if (ok) setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="+ DJ toevoegen…"
            aria-label={`DJ toevoegen aan ${displayEditionName(event.name)}`}
            className="min-w-0 flex-1 border-b-[1.5px] border-transparent bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-text-dim focus:border-border-strong"
          />
          <button
            type="submit"
            disabled={adding || !draft.trim()}
            className="th-sticker inline-flex items-center gap-1.5 bg-accent px-3 py-2 text-xs text-accent-contrast transition-opacity disabled:opacity-30"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            Toevoegen
          </button>
        </form>
      </div>
    </article>
  );
}
