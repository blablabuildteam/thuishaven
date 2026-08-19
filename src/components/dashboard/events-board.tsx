"use client";

import { useMemo, useState } from "react";
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
  lastWeekSold: number | null;
  mailOrdersAfter: number | null;
  brevoClickOrders: number | null;
  weather: ClassifiedWeather | null;
};

const FORMAT_FILTERS: Array<{ id: "all" | EditionFormat; label: string }> = [
  { id: "all", label: "Alle" },
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

const WEEKDAY_FILTERS: Array<{ id: "all" | WeekdayKey; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "vr", label: "Vr" },
  { id: "za", label: "Za" },
  { id: "zo", label: "Zo" },
  { id: "other", label: "Overig" },
];

const PERIOD_FILTERS: Array<{ id: "all" | CalendarPeriod; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "outdoor", label: "Outdoor" },
  { id: "winter", label: "Winter" },
  { id: "paas", label: "Paas" },
  { id: "pinksteren", label: "Pinksteren" },
  { id: "koningsdag", label: "Koningsdag" },
  { id: "ade", label: "ADE-week" },
];

const YEAR_FILTERS: Array<{ id: "all" | number; label: string }> = [
  { id: "all", label: "Alle" },
  { id: 2025, label: "2025" },
  { id: 2026, label: "2026" },
];

const WEATHER_FILTERS: Array<{ id: "all" | WeatherKind; label: string }> = [
  { id: "all", label: "Alle" },
  ...WEATHER_DEFS.map((d) => ({ id: d.kind, label: d.label })),
];

function ChipRow<T extends string | number>({
  label,
  options,
  value,
  counts,
  onChange,
}: {
  label: string;
  options: Array<{ id: "all" | T; label: string }>;
  value: "all" | T;
  counts: Record<string, number>;
  onChange: (v: "all" | T) => void;
}) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {options.map((f) => {
          const n = counts[String(f.id)] ?? 0;
          if (f.id !== "all" && n === 0) return null;
          const active = value === f.id;
          return (
            <button
              key={String(f.id)}
              type="button"
              onClick={() => onChange(f.id)}
              className={cn(
                "px-2.5 py-1 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-contrast"
                  : "border border-border text-text-muted hover:border-text hover:text-text",
              )}
            >
              {f.label}
              <span className="ml-1 text-[11px] opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EventsBoard({
  rows,
  totalSold,
}: {
  rows: EventsBoardRow[];
  totalSold: number;
}) {
  const [format, setFormat] = useState<"all" | EditionFormat>("all");
  const [weekday, setWeekday] = useState<"all" | WeekdayKey>("all");
  const [period, setPeriod] = useState<"all" | CalendarPeriod>("all");
  const [year, setYear] = useState<"all" | number>("all");
  const [weather, setWeather] = useState<"all" | WeatherKind>("all");
  const [dj, setDj] = useState<string>("");
  const [djQuery, setDjQuery] = useState("");
  const [djOpen, setDjOpen] = useState(false);

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
    if (!q) return artists.slice(0, 40);
    return artists
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [artists, djQuery]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (format !== "all" && r.format !== format) return false;
      if (weekday !== "all" && r.weekday !== weekday) return false;
      if (period !== "all" && !r.periods.includes(period)) return false;
      if (year !== "all" && r.year !== year) return false;
      if (weather !== "all") {
        if (!r.weather || r.weather.kind !== weather) return false;
      }
      if (dj && !r.artists.some((a) => a.toLowerCase() === dj.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [rows, format, weekday, period, year, weather, dj]);

  const countsFor = useMemo(() => {
    const base = rows.filter((r) => {
      if (format !== "all" && r.format !== format) return false;
      if (weekday !== "all" && r.weekday !== weekday) return false;
      if (period !== "all" && !r.periods.includes(period)) return false;
      if (year !== "all" && r.year !== year) return false;
      if (weather !== "all") {
        if (!r.weather || r.weather.kind !== weather) return false;
      }
      if (dj && !r.artists.some((a) => a.toLowerCase() === dj.toLowerCase())) {
        return false;
      }
      return true;
    });

    // Counts per dimension: ignore that dimension's own filter
    const without = (
      skip: "format" | "weekday" | "period" | "year" | "weather",
    ) =>
      rows.filter((r) => {
        if (skip !== "format" && format !== "all" && r.format !== format)
          return false;
        if (skip !== "weekday" && weekday !== "all" && r.weekday !== weekday)
          return false;
        if (
          skip !== "period" &&
          period !== "all" &&
          !r.periods.includes(period)
        )
          return false;
        if (skip !== "year" && year !== "all" && r.year !== year) return false;
        if (skip !== "weather" && weather !== "all") {
          if (!r.weather || r.weather.kind !== weather) return false;
        }
        if (dj && !r.artists.some((a) => a.toLowerCase() === dj.toLowerCase()))
          return false;
        return true;
      });

    const formatCounts: Record<string, number> = { all: without("format").length };
    for (const r of without("format")) {
      formatCounts[r.format] = (formatCounts[r.format] ?? 0) + 1;
    }

    const weekdayCounts: Record<string, number> = {
      all: without("weekday").length,
    };
    for (const r of without("weekday")) {
      weekdayCounts[r.weekday] = (weekdayCounts[r.weekday] ?? 0) + 1;
    }

    const periodCounts: Record<string, number> = {
      all: without("period").length,
    };
    for (const r of without("period")) {
      for (const p of r.periods) {
        periodCounts[p] = (periodCounts[p] ?? 0) + 1;
      }
    }

    const yearCounts: Record<string, number> = { all: without("year").length };
    for (const r of without("year")) {
      yearCounts[String(r.year)] = (yearCounts[String(r.year)] ?? 0) + 1;
    }

    const weatherCounts: Record<string, number> = {
      all: without("weather").length,
    };
    for (const r of without("weather")) {
      if (!r.weather) continue;
      weatherCounts[r.weather.kind] = (weatherCounts[r.weather.kind] ?? 0) + 1;
    }

    return {
      format: formatCounts,
      weekday: weekdayCounts,
      period: periodCounts,
      year: yearCounts,
      weather: weatherCounts,
      visibleSold: base.reduce((s, r) => s + r.sold, 0),
    };
  }, [rows, format, weekday, period, year, weather, dj]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-2xl tracking-[0.03em]">Edities</h2>
        <p className="text-xs text-text-dim">
          {formatNumber(visible.length)} ·{" "}
          {formatNumber(countsFor.visibleSold || totalSold)} sold
        </p>
      </div>

      <div className="mb-4 border border-border bg-surface p-3">
        <ChipRow
          label="Format"
          options={FORMAT_FILTERS}
          value={format}
          counts={countsFor.format}
          onChange={setFormat}
        />
        <ChipRow
          label="Weekdag"
          options={WEEKDAY_FILTERS}
          value={weekday}
          counts={countsFor.weekday}
          onChange={setWeekday}
        />
        <ChipRow
          label="Periode"
          options={PERIOD_FILTERS}
          value={period}
          counts={countsFor.period}
          onChange={setPeriod}
        />
        <ChipRow
          label="Jaar"
          options={YEAR_FILTERS}
          value={year}
          counts={countsFor.year}
          onChange={setYear}
        />
        <ChipRow
          label="Weer"
          options={WEATHER_FILTERS}
          value={weather}
          counts={countsFor.weather}
          onChange={setWeather}
        />

        <div className="mb-2">
          <p className="mb-1 text-[10px] font-medium tracking-[0.12em] text-text-dim uppercase">
            DJ
          </p>
          <div className="relative max-w-sm">
            <div className="flex gap-1">
              <input
                type="text"
                value={djOpen || !dj ? djQuery : dj}
                onChange={(e) => {
                  setDjQuery(e.target.value);
                  setDjOpen(true);
                  if (dj) setDj("");
                }}
                onFocus={() => setDjOpen(true)}
                placeholder="Zoek DJ…"
                className="w-full border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-text"
              />
              {dj && (
                <button
                  type="button"
                  onClick={() => {
                    setDj("");
                    setDjQuery("");
                    setDjOpen(false);
                  }}
                  className="border border-border px-2 text-sm text-text-muted hover:border-text"
                >
                  Wis
                </button>
              )}
            </div>
            {djOpen && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto border border-border bg-surface shadow-sm">
                {djOptions.map((a) => (
                  <li key={a.name}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-hover"
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
                  <li className="px-3 py-2 text-sm text-text-muted">
                    Geen DJ gevonden
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-text-dim">
            Weer-definities
          </summary>
          <ul className="mt-2 space-y-1 text-[11px] text-text-muted">
            {WEATHER_DEFS.map((d) => (
              <li key={d.kind}>
                <span className="font-medium text-text">{d.label}</span>
                {" — "}
                {d.definition}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <ul className="divide-y divide-border border-y border-border">
        {visible.map((r) => {
          const wx = r.weather;
          return (
            <li
              key={r.id}
              className={cn(
                "grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 px-2 py-3 sm:grid-cols-[5rem_1fr_auto_auto] sm:gap-3 sm:px-3",
                wx && weatherPanelClass(wx.kind),
              )}
            >
              <div>
                <p className="font-display text-base leading-none sm:text-lg">
                  {formatDayShort(r.day)}
                </p>
                <p className="mt-0.5 text-[10px] text-text-dim">
                  {WEEKDAY_LABEL[r.weekday]} · {r.year} ·{" "}
                  {EDITION_FORMAT_LABEL[r.format]}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium sm:text-base">
                  {r.headliner ?? r.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-text-muted">
                  {r.sold > 0 ? formatNumber(r.sold) : "—"}
                  {r.lastWeekSold != null
                    ? ` · wk ${formatNumber(r.lastWeekSold)}`
                    : ""}
                  {r.mailOrdersAfter != null && r.mailOrdersAfter > 0
                    ? ` · mail +${formatNumber(r.mailOrdersAfter)}`
                    : r.brevoClickOrders != null && r.brevoClickOrders > 0
                      ? ` · brevo ${formatNumber(r.brevoClickOrders)}`
                      : ""}
                  {r.periods.includes("paas") ||
                  r.periods.includes("pinksteren") ||
                  r.periods.includes("koningsdag")
                    ? ` · ${r.periods
                        .filter((p) =>
                          ["paas", "pinksteren", "koningsdag", "ade"].includes(
                            p,
                          ),
                        )
                        .map((p) => CALENDAR_PERIOD_LABEL[p].split(" ")[0])
                        .join("/")}`
                    : ""}
                </p>
              </div>
              <p className="hidden text-right font-display text-xl sm:block">
                {r.sold > 0 ? formatNumber(r.sold) : "—"}
              </p>
              <div className="justify-self-end">
                {wx ? (
                  <div className="text-right">
                    <p className="font-display text-lg leading-none">
                      {wx.tempMaxC != null ? `${Math.round(wx.tempMaxC)}°` : "—"}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {wx.precipMm >= 0.5
                        ? `${wx.precipMm.toFixed(wx.precipMm >= 10 ? 0 : 1)} mm`
                        : "droog"}
                    </p>
                  </div>
                ) : (
                  <span className="text-[10px] text-text-dim">—</span>
                )}
              </div>
            </li>
          );
        })}
        {!visible.length && (
          <li className="px-3 py-8 text-sm text-text-muted">
            Niets in dit filter.{" "}
            <Link href="/koppelingen" className="underline">
              Bronnen
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
