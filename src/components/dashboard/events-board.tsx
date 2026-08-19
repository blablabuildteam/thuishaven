"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatNumber, cn } from "@/lib/utils";
import {
  EDITION_FORMAT_LABEL,
  type EditionFormat,
} from "@/lib/editions/lineup";
import { weatherPanelClass } from "@/components/dashboard/weather-condition";
import { formatDayShort } from "@/lib/time/amsterdam";
import {
  CALENDAR_PERIOD_LABEL,
  WEEKDAY_LABEL,
  type CalendarPeriod,
  type WeekdayKey,
} from "@/lib/time/nl-calendar";
import {
  WEATHER_DEFS,
  type ClassifiedWeather,
  type WeatherKind,
} from "@/lib/weather/classify";

export type FillStatus = "sold_out" | "near" | "room" | "unknown";

export type EventsBoardRow = {
  id: string;
  day: string;
  name: string;
  headliner: string | null;
  artists: string[];
  format: EditionFormat;
  weekday: WeekdayKey;
  year: number;
  periods: CalendarPeriod[];
  sold: number;
  capacity: number | null;
  sellThrough: number | null;
  lastWeekSold: number | null;
  mailOrdersAfter: number | null;
  brevoClickOrders: number | null;
  weather: ClassifiedWeather | null;
};

/** Weeztix-cap: 100% = uitverkocht; <90% = restcapaciteit (kon beter). */
export function fillStatus(
  sellThrough: number | null,
  capacity: number | null,
): FillStatus {
  if (capacity == null || capacity <= 0 || sellThrough == null) return "unknown";
  if (sellThrough >= 99.5) return "sold_out";
  if (sellThrough >= 90) return "near";
  return "room";
}

const FORMAT_OPTS: Array<{ id: "all" | EditionFormat; label: string }> = [
  { id: "all", label: "Alle formats" },
  { id: "hrs10", label: "10HRS" },
  { id: "regular", label: "Regular" },
  { id: "nacht", label: "Nacht" },
  { id: "ade", label: "ADE" },
  { id: "paas", label: "Paas" },
  { id: "hollandse_haven", label: "Hollandse Haven" },
  { id: "opening", label: "Opening" },
  { id: "closing", label: "Closing" },
  { id: "other", label: "Overig" },
];

const WEEKDAY_OPTS: Array<{ id: "all" | WeekdayKey; label: string }> = [
  { id: "all", label: "Alle dagen" },
  { id: "vr", label: "Vrijdag" },
  { id: "za", label: "Zaterdag" },
  { id: "zo", label: "Zondag" },
  { id: "other", label: "Overig" },
];

const PERIOD_OPTS: Array<{ id: "all" | CalendarPeriod; label: string }> = [
  { id: "all", label: "Alle periodes" },
  { id: "outdoor", label: "Outdoor (mei–sept)" },
  { id: "winter", label: "Winter" },
  { id: "paas", label: "Paas-window" },
  { id: "pinksteren", label: "Pinksteren" },
  { id: "koningsdag", label: "Koningsdag ±1" },
  { id: "ade", label: "ADE-week" },
];

const YEAR_OPTS: Array<{ id: "all" | number; label: string }> = [
  { id: "all", label: "Alle jaren" },
  { id: 2025, label: "2025" },
  { id: 2026, label: "2026" },
];

const WEATHER_OPTS: Array<{ id: "all" | WeatherKind; label: string }> = [
  { id: "all", label: "Alle weer" },
  ...WEATHER_DEFS.map((d) => ({ id: d.kind, label: d.label })),
];

const FILL_OPTS: Array<{ id: "all" | FillStatus; label: string }> = [
  { id: "all", label: "Alle fill" },
  { id: "sold_out", label: "Uitverkocht (100%)" },
  { id: "near", label: "Bijna vol (≥90%)" },
  { id: "room", label: "Kon beter (<90%)" },
  { id: "unknown", label: "Geen cap-data" },
];

const FILL_CHIP: Record<Exclude<FillStatus, "unknown">, string> = {
  sold_out: "Uitverkocht",
  near: "Bijna vol",
  room: "Kon beter",
};

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string | number; label: string }>;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-border bg-bg px-2.5 py-2 text-sm text-text outline-none focus:border-text"
      >
        {options.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EventsBoard({ rows }: { rows: EventsBoardRow[] }) {
  const [format, setFormat] = useState<"all" | EditionFormat>("all");
  const [weekday, setWeekday] = useState<"all" | WeekdayKey>("all");
  const [period, setPeriod] = useState<"all" | CalendarPeriod>("all");
  const [year, setYear] = useState<"all" | number>("all");
  const [weather, setWeather] = useState<"all" | WeatherKind>("all");
  const [fill, setFill] = useState<"all" | FillStatus>("all");
  const [dj, setDj] = useState("");
  const [djQuery, setDjQuery] = useState("");
  const [djOpen, setDjOpen] = useState(false);
  const djRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!djRef.current?.contains(e.target as Node)) setDjOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const artists = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      for (const a of r.artists.slice(0, 3)) {
        m.set(a, (m.get(a) ?? 0) + 1);
      }
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, n]) => ({ name, n }));
  }, [rows]);

  const djOptions = useMemo(() => {
    const q = djQuery.trim().toLowerCase();
    const list = !q
      ? artists
      : artists.filter((a) => a.name.toLowerCase().includes(q));
    return list.slice(0, 50);
  }, [artists, djQuery]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (format !== "all" && r.format !== format) return false;
      if (weekday !== "all" && r.weekday !== weekday) return false;
      if (period !== "all" && !r.periods.includes(period)) return false;
      if (year !== "all" && r.year !== year) return false;
      if (weather !== "all" && (!r.weather || r.weather.kind !== weather))
        return false;
      if (fill !== "all" && fillStatus(r.sellThrough, r.capacity) !== fill)
        return false;
      if (dj && !r.artists.some((a) => a.toLowerCase() === dj.toLowerCase()))
        return false;
      return true;
    });
  }, [rows, format, weekday, period, year, weather, fill, dj]);

  const stats = useMemo(() => {
    const sold = visible.reduce((s, r) => s + r.sold, 0);
    const withSales = visible.filter((r) => r.sold > 0);
    const avg =
      withSales.length > 0 ? Math.round(sold / withSales.length) : 0;
    const withFill = visible.filter((r) => r.sellThrough != null);
    const avgFill =
      withFill.length > 0
        ? Math.round(
            withFill.reduce((s, r) => s + (r.sellThrough ?? 0), 0) /
              withFill.length,
          )
        : null;
    let soldOut = 0;
    let room = 0;
    for (const r of visible) {
      const st = fillStatus(r.sellThrough, r.capacity);
      if (st === "sold_out") soldOut += 1;
      if (st === "room") room += 1;
    }
    return { sold, avg, n: visible.length, avgFill, soldOut, room };
  }, [visible]);

  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (format !== "all")
      chips.push({
        key: "format",
        label: EDITION_FORMAT_LABEL[format],
        clear: () => setFormat("all"),
      });
    if (weekday !== "all")
      chips.push({
        key: "weekday",
        label: WEEKDAY_LABEL[weekday],
        clear: () => setWeekday("all"),
      });
    if (period !== "all")
      chips.push({
        key: "period",
        label: CALENDAR_PERIOD_LABEL[period],
        clear: () => setPeriod("all"),
      });
    if (year !== "all")
      chips.push({
        key: "year",
        label: String(year),
        clear: () => setYear("all"),
      });
    if (weather !== "all")
      chips.push({
        key: "weather",
        label: WEATHER_DEFS.find((d) => d.kind === weather)?.label ?? weather,
        clear: () => setWeather("all"),
      });
    if (fill !== "all")
      chips.push({
        key: "fill",
        label: FILL_OPTS.find((o) => o.id === fill)?.label ?? fill,
        clear: () => setFill("all"),
      });
    if (dj)
      chips.push({
        key: "dj",
        label: dj,
        clear: () => {
          setDj("");
          setDjQuery("");
        },
      });
    return chips;
  }, [format, weekday, period, year, weather, fill, dj]);

  function resetFilters() {
    setFormat("all");
    setWeekday("all");
    setPeriod("all");
    setYear("all");
    setWeather("all");
    setFill("all");
    setDj("");
    setDjQuery("");
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl tracking-[0.03em]">Edities</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <p>
            <span className="font-display text-xl">{formatNumber(stats.n)}</span>
            <span className="ml-1.5 text-text-dim">edities</span>
          </p>
          <p>
            <span className="font-display text-xl">
              {formatNumber(stats.sold)}
            </span>
            <span className="ml-1.5 text-text-dim">sold</span>
          </p>
          <p>
            <span className="font-display text-xl">
              {stats.avgFill != null ? `${stats.avgFill}%` : "—"}
            </span>
            <span className="ml-1.5 text-text-dim">gem. fill</span>
          </p>
          <p>
            <span className="font-display text-xl">
              {formatNumber(stats.soldOut)}
            </span>
            <span className="ml-1.5 text-text-dim">uitverkocht</span>
          </p>
          <p>
            <span className="font-display text-xl">
              {formatNumber(stats.room)}
            </span>
            <span className="ml-1.5 text-text-dim">kon beter</span>
          </p>
        </div>
      </div>

      <div className="mb-3 border border-border bg-surface p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          <SelectField
            label="Format"
            value={format}
            onChange={(v) => setFormat(v as "all" | EditionFormat)}
            options={FORMAT_OPTS}
          />
          <SelectField
            label="Weekdag"
            value={weekday}
            onChange={(v) => setWeekday(v as "all" | WeekdayKey)}
            options={WEEKDAY_OPTS}
          />
          <SelectField
            label="Periode"
            value={period}
            onChange={(v) => setPeriod(v as "all" | CalendarPeriod)}
            options={PERIOD_OPTS}
          />
          <SelectField
            label="Jaar"
            value={String(year)}
            onChange={(v) =>
              setYear(v === "all" ? "all" : (Number(v) as 2025 | 2026))
            }
            options={YEAR_OPTS}
          />
          <SelectField
            label="Fill"
            value={fill}
            onChange={(v) => setFill(v as "all" | FillStatus)}
            options={FILL_OPTS}
          />
          <SelectField
            label="Weer"
            value={weather}
            onChange={(v) => setWeather(v as "all" | WeatherKind)}
            options={WEATHER_OPTS}
          />
          <div ref={djRef} className="relative min-w-0">
            <span className="mb-1 block text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
              DJ
            </span>
            <input
              type="text"
              value={djOpen || !dj ? djQuery : dj}
              onChange={(e) => {
                setDjQuery(e.target.value);
                setDjOpen(true);
                if (dj) setDj("");
              }}
              onFocus={() => setDjOpen(true)}
              placeholder="Zoek…"
              className="w-full border border-border bg-bg px-2.5 py-2 text-sm outline-none focus:border-text"
            />
            {djOpen && (
              <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto border border-border bg-surface">
                {djOptions.map((a) => (
                  <li key={a.name}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-hover"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setDj(a.name);
                        setDjQuery(a.name);
                        setDjOpen(false);
                      }}
                    >
                      <span>{a.name}</span>
                      <span className="text-[11px] text-text-dim">{a.n}</span>
                    </button>
                  </li>
                ))}
                {!djOptions.length && (
                  <li className="px-3 py-2 text-sm text-text-muted">Geen DJ</li>
                )}
              </ul>
            )}
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            {activeFilters.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.clear}
                className="border border-border bg-bg px-2 py-1 text-xs hover:border-text"
              >
                {c.label} ×
              </button>
            ))}
            <button
              type="button"
              className="px-2 py-1 text-xs text-text-dim underline"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-text-dim">
            Fill = Weeztix-cap (sold ÷ capaciteit), niet zaalcapaciteit
          </summary>
          <ul className="mt-2 grid gap-1 text-[11px] text-text-muted sm:grid-cols-2">
            <li>
              <span className="text-text">Uitverkocht</span> — ≥99,5% van de
              ticketcap
            </li>
            <li>
              <span className="text-text">Bijna vol</span> — 90–99%
            </li>
            <li>
              <span className="text-text">Kon beter</span> — &lt;90% fill, dus
              resttickets
            </li>
            <li>
              <span className="text-text">Geen cap-data</span> — oudere edities
              zonder Weeztix-inventory
            </li>
          </ul>
        </details>
      </div>

      <ul className="divide-y divide-border border-y border-border">
        {visible.map((r) => {
          const wx = r.weather;
          const st = fillStatus(r.sellThrough, r.capacity);
          const left =
            r.capacity != null && r.capacity > 0
              ? Math.max(0, r.capacity - r.sold)
              : null;
          return (
            <li
              key={r.id}
              className={cn(
                "grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 px-2 py-2.5 sm:grid-cols-[5rem_1fr_minmax(5.5rem,auto)_auto] sm:gap-3 sm:px-3",
                wx && weatherPanelClass(wx.kind),
              )}
            >
              <div>
                <p className="font-display text-base leading-none sm:text-lg">
                  {formatDayShort(r.day)}
                </p>
                <p className="mt-0.5 text-[10px] text-text-dim">
                  {WEEKDAY_LABEL[r.weekday]} · {r.year}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {r.headliner ?? r.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-text-muted">
                  {EDITION_FORMAT_LABEL[r.format]}
                  {r.lastWeekSold != null
                    ? ` · laatste week ${formatNumber(r.lastWeekSold)}`
                    : ""}
                  {r.mailOrdersAfter != null && r.mailOrdersAfter > 0
                    ? ` · na mail ${formatNumber(r.mailOrdersAfter)}`
                    : ""}
                </p>
              </div>
              <div className="justify-self-end text-right sm:justify-self-auto">
                <p className="font-display text-lg leading-none sm:text-xl">
                  {r.sold > 0 ? formatNumber(r.sold) : "—"}
                </p>
                {st !== "unknown" && r.sellThrough != null ? (
                  <p
                    className={cn(
                      "mt-0.5 text-[10px] font-medium",
                      st === "sold_out" && "text-text",
                      st === "near" && "text-text-muted",
                      st === "room" && "text-warn",
                    )}
                  >
                    {Math.round(r.sellThrough)}% · {FILL_CHIP[st]}
                    {st === "room" && left != null && left > 0
                      ? ` · ${formatNumber(left)} over`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-text-dim">geen fill</p>
                )}
              </div>
              <div className="hidden justify-self-end text-right sm:block">
                {wx ? (
                  <>
                    <p className="font-display text-lg leading-none">
                      {wx.tempMaxC != null
                        ? `${Math.round(wx.tempMaxC)}°`
                        : "—"}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {wx.precipMm >= 0.5
                        ? `${wx.precipMm.toFixed(wx.precipMm >= 10 ? 0 : 1)} mm`
                        : "droog"}
                    </p>
                  </>
                ) : (
                  <span className="text-[10px] text-text-dim">—</span>
                )}
              </div>
            </li>
          );
        })}
        {!visible.length && (
          <li className="px-3 py-8 text-sm text-text-muted">
            Geen edities met deze filters.{" "}
            <Link href="/koppelingen" className="underline">
              Bronnen
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
