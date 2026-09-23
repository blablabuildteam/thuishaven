"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { DjFeeRangeSelect } from "@/components/dashboard/dj-fee-range-select";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  addDjFeeRangeToSpend,
  countMissingDjFeeRanges,
  emptyDjFeeSpend,
  eventNeedsDjFees,
  formatDjFeeSpend,
  monthKeyFromDay,
  monthLabelFromDay,
  monthNameFromDay,
  notifyDjFeesChanged,
  type DjFeeArtistView,
  type DjFeeEventView,
  type DjFeeRangeId,
  type DjFeeSpend,
} from "@/lib/dashboard/dj-fee-ranges";
import { displayEditionName } from "@/lib/editions/lineup";
import { formatTicketSheetDate } from "@/lib/time/amsterdam";
import { cn } from "@/lib/utils";

/** Fixed control columns — pinned to the card's right edge so they align across events. */
const DJ_FEE_CONTROLS_W = "w-[28.25rem]"; // 14 + 9.5 + 4.75 rem
const DJ_FEE_ROW = "flex w-full min-w-[44rem] items-center";

function spendFor(artists: DjFeeArtistView[]): DjFeeSpend {
  const spend = emptyDjFeeSpend();
  for (const artist of artists) addDjFeeRangeToSpend(spend, artist.feeRange);
  return spend;
}

function eventMissingCount(event: DjFeeEventView): number {
  return countMissingDjFeeRanges(event.artists);
}

function eventNeedsFees(event: DjFeeEventView): boolean {
  return eventNeedsDjFees(event.artists);
}

function sourceLabel(source: DjFeeArtistView["source"]): string | null {
  if (source === "resident_advisor") return "RA";
  if (source === "custom") return "handmatig";
  return null;
}

function TabBadge({ count, active }: { count: number; active: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} event${count === 1 ? "" : "s"} zonder complete DJ-fees`}
      className={cn(
        "min-w-[1.15rem] px-1 text-center text-[10px] font-medium tabular-nums",
        active ? "bg-accent-contrast/20 text-accent-contrast" : "bg-highlight text-black",
      )}
    >
      {count}
    </span>
  );
}

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
      aria-label="10HRS"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex w-full items-center gap-2 text-xs whitespace-nowrap",
        disabled && "opacity-60",
      )}
    >
      <span className={cn("tabular-nums", value ? "text-text-dim" : "text-text")}>
        nee
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          value ? "bg-fuchsia-400" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0 size-4 rounded-full bg-white shadow-sm transition-transform",
            value ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
      <span className={cn("tabular-nums", value ? "text-text" : "text-text-dim")}>
        ja
      </span>
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
    body: { feeRange?: DjFeeRangeId | null; isTenHour?: boolean },
  ) {
    const previous = artist;
    const optimistic: DjFeeArtistView = {
      ...artist,
      ...body,
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

  return (
    <div>
      <SectionHeader
        eyebrow="Alerts"
        title="DJ-fees"
        description="Prijsrange per DJ, plus of het een 10HRS-set was. Line-up komt uit Resident Advisor; je kunt DJs zelf toevoegen of weghalen. Bedragen zijn bandbreedtes, geen exacte fees."
        action={
          <div className="relative w-full sm:w-72">
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
              className="w-full border border-border bg-bg py-2.5 pr-3 pl-10 text-sm outline-none focus:border-text"
            />
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <MetricCard
          label={query.trim() ? "Gevonden spend" : "Spend deze maand"}
          value={formatDjFeeSpend(monthSpend)}
          hint={
            monthSpend.priced === 0
              ? "Nog geen ranges ingevuld"
              : `${monthSpend.priced} DJ${monthSpend.priced === 1 ? "" : "s"} met range`
          }
        />
        <MetricCard
          label="Nog in te vullen"
          value={String(monthSpend.missing)}
          hint="DJs zonder prijsrange"
        />
      </div>

      {!query.trim() && months.length > 0 && (
        <div className="mb-5 space-y-2">
          <div
            className="flex gap-1 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Jaar"
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
                    "inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm",
                    active
                      ? "bg-accent text-accent-contrast"
                      : "text-text-muted hover:bg-surface hover:text-text",
                  )}
                >
                  {year}
                  <TabBadge count={pending} active={active} />
                </button>
              );
            })}
          </div>
          <div
            className="flex gap-1 overflow-x-auto pb-1"
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
                    "inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm capitalize",
                    active
                      ? "bg-accent text-accent-contrast"
                      : "text-text-muted hover:bg-surface hover:text-text",
                  )}
                >
                  {item.label}
                  <TabBadge count={pending} active={active} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="border border-border bg-surface px-4 py-8 text-sm text-text-muted">
          {query.trim()
            ? `Geen events of DJs gevonden voor “${query.trim()}”.`
            : "Geen events in deze maand."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              focused={event.id === focusEditionId}
              busyId={busyId}
              onFeeChange={(artist, feeRange) =>
                void patchArtist(event.id, artist, { feeRange })
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
  focused,
  busyId,
  onFeeChange,
  onTenHourToggle,
  onRemove,
  onAdd,
}: {
  event: DjFeeEventView;
  focused?: boolean;
  busyId: string | null;
  onFeeChange: (artist: DjFeeArtistView, feeRange: DjFeeRangeId | null) => void;
  onTenHourToggle: (artist: DjFeeArtistView) => void;
  onRemove: (artist: DjFeeArtistView) => void;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const adding = busyId === event.id;
  const sourceHint =
    event.artistsSource === "resident_advisor"
      ? "Line-up uit Resident Advisor"
      : event.artistsSource === "edition_name"
        ? "Line-up uit eventnaam"
        : "Nog geen line-up — voeg DJs zelf toe";

  return (
    <section
      id={`dj-fee-${event.id}`}
      className={cn(
        "scroll-mt-24 border border-border bg-surface",
        focused && "ring-1 ring-text",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-text-dim uppercase">
            {formatTicketSheetDate(event.day)}
          </p>
          <h2 className="mt-0.5 font-medium text-text">
            {displayEditionName(event.name)}
          </h2>
          <p className="mt-1 text-xs text-text-dim">{sourceHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {eventNeedsFees(event) && (
            <span className="bg-highlight px-2 py-0.5 text-[11px] font-medium text-black">
              {eventMissingCount(event)} open
            </span>
          )}
          <span className="text-sm tabular-nums text-text-muted">
            {formatDjFeeSpend(event.spend)}
          </span>
        </div>
      </header>

      <div className="max-w-full overflow-x-auto">
        <div className="w-full min-w-[44rem]">
          <div
            className={cn(
              DJ_FEE_ROW,
              "text-[11px] tracking-wider text-text-dim uppercase",
            )}
          >
            <div className="min-w-0 flex-1 px-4 py-2 font-medium">DJ</div>
            <div
              className={cn(
                "flex shrink-0 items-center",
                DJ_FEE_CONTROLS_W,
              )}
            >
              <div className="w-[14rem] px-4 py-2 font-medium">Prijs</div>
              <div className="w-[9.5rem] px-4 py-2 font-medium">10HRS</div>
              <div className="w-[4.75rem] px-4 py-2">
                <span className="sr-only">Acties</span>
              </div>
            </div>
          </div>
          {event.artists.length === 0 && (
            <p className="border-t border-border/70 px-4 py-3 text-sm text-text-muted">
              Nog geen DJs op dit event.
            </p>
          )}
          {event.artists.map((artist) => {
            const hint = sourceLabel(artist.source);
            const busy = busyId === artist.id;
            return (
              <div
                key={artist.id}
                className={cn(DJ_FEE_ROW, "border-t border-border/70 text-sm")}
              >
                <div className="min-w-0 flex-1 px-4 py-2.5">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-medium">{artist.name}</span>
                    {hint && (
                      <span className="shrink-0 text-[10px] tracking-wide text-text-dim uppercase">
                        {hint}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    "flex shrink-0 items-center",
                    DJ_FEE_CONTROLS_W,
                  )}
                >
                  <div className="w-[14rem] px-4 py-2.5">
                    <DjFeeRangeSelect
                      value={artist.feeRange}
                      disabled={busy}
                      onChange={(feeRange) => onFeeChange(artist, feeRange)}
                    />
                  </div>
                  <div className="w-[9.5rem] px-4 py-2.5">
                    <TenHourToggle
                      value={artist.isTenHour}
                      disabled={busy}
                      onToggle={() => onTenHourToggle(artist)}
                    />
                  </div>
                  <div className="w-[4.75rem] px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(artist)}
                      className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-danger"
                      aria-label={`${artist.name} verwijderen`}
                    >
                      <Trash2 className="size-3.5" />
                      Weg
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form
        className="flex flex-wrap gap-2 border-t border-border px-4 py-3"
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
          placeholder="DJ toevoegen…"
          aria-label={`DJ toevoegen aan ${displayEditionName(event.name)}`}
          className="min-w-[12rem] flex-1 border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-text"
        />
        <button
          type="submit"
          disabled={adding || !draft.trim()}
          className="inline-flex items-center gap-1.5 bg-accent px-3 py-2 text-sm text-accent-contrast disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          Toevoegen
        </button>
      </form>
    </section>
  );
}
