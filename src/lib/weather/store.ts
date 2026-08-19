import { and, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, externalEvents, weatherDaily } from "@/lib/db/schema";
import {
  AMS,
  fetchOpenMeteoRange,
  type WeatherDayRow,
} from "@/lib/weather/open-meteo";
import { scoreFestivalWeather } from "@/lib/weather/festival-score";
import { amsterdamDay } from "@/lib/time/amsterdam";

export function weatherLocationMatch() {
  return or(
    eq(weatherDaily.locationKey, AMS.locationKey),
    eq(weatherDaily.locationKey, "amsterdam"),
  );
}

function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

function toIsoDay(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export async function syncWeatherRange(options: {
  startDate: string;
  endDate: string;
  /** Alleen deze YYYY-MM-DD dagen persisten (event-dagen). */
  onlyDays?: Set<string>;
}): Promise<{ upserted: number; rows: WeatherDayRow[]; skipped: number }> {
  const rows = await fetchOpenMeteoRange(options);
  const filtered = options.onlyDays
    ? rows.filter((r) => options.onlyDays!.has(r.day))
    : rows;

  if (!hasDatabase()) {
    return {
      upserted: 0,
      rows: filtered,
      skipped: rows.length - filtered.length,
    };
  }

  const db = getDb();
  let upserted = 0;
  for (const row of filtered) {
    const day = dayToDate(row.day);
    const existing = await db
      .select({ id: weatherDaily.id })
      .from(weatherDaily)
      .where(
        and(
          weatherLocationMatch(),
          sql`(${weatherDaily.day})::date = ${row.day}::date`,
        ),
      )
      .limit(1);

    const scored = scoreFestivalWeather({
      day: row.day,
      tempMinC: row.tempMinC,
      tempMaxC: row.tempMaxC,
      precipMm: row.precipMm,
      windMaxMps: row.windMaxMps,
      weatherCode: row.weatherCode,
    });

    const values = {
      day,
      locationKey: AMS.locationKey,
      locationLabel: AMS.locationLabel,
      tempMinC: row.tempMinC != null ? String(row.tempMinC) : null,
      tempMaxC: row.tempMaxC != null ? String(row.tempMaxC) : null,
      precipMm: row.precipMm != null ? String(row.precipMm) : null,
      windMaxMps: row.windMaxMps != null ? String(row.windMaxMps) : null,
      weatherCode: row.weatherCode,
      source: "open-meteo",
      raw: {
        ...row.raw,
        festivalScore: scored.score,
        festivalBand: scored.band,
        festivalLabel: scored.label,
        festivalReasons: scored.reasons,
      },
      syncedAt: new Date(),
    };

    if (existing[0]) {
      await db
        .update(weatherDaily)
        .set(values)
        .where(eq(weatherDaily.id, existing[0].id));
    } else {
      await db.insert(weatherDaily).values(values);
    }
    upserted += 1;
  }

  return {
    upserted,
    rows: filtered,
    skipped: rows.length - filtered.length,
  };
}

/** Unieke eventdagen uit Weeztix/editions (excl. templates). */
export async function listEditionEventDays(): Promise<string[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const rows = await db
    .select({ startsAt: editions.startsAt, name: editions.name })
    .from(editions)
    .where(isNotNull(editions.weeztixEventId));

  const days = new Set<string>();
  for (const r of rows) {
    if (/template/i.test(r.name)) continue;
    days.add(amsterdamDay(r.startsAt) || toIsoDay(r.startsAt));
  }
  return [...days].sort();
}

/**
 * Historisch weer alleen op Thuishaven-eventdagen.
 * Haalt Open-Meteo per jaarbereik op, persist alleen eventdagen.
 */
export async function syncWeatherForEditionDays(options?: {
  fromYear?: number;
  toYear?: number;
}): Promise<{
  ok: boolean;
  eventDays: number;
  upserted: number;
  years: Array<{ year: number; days: number; upserted: number }>;
  error?: string;
}> {
  try {
    const allDays = await listEditionEventDays();
    const fromYear = options?.fromYear ?? 2021;
    const toYear = options?.toYear ?? new Date().getFullYear() + 1;
    const days = allDays.filter((d) => {
      const y = Number(d.slice(0, 4));
      return y >= fromYear && y <= toYear;
    });

    if (!days.length) {
      return {
        ok: false,
        eventDays: 0,
        upserted: 0,
        years: [],
        error: "Geen edition-dagen gevonden",
      };
    }

    const byYear = new Map<number, string[]>();
    for (const d of days) {
      const y = Number(d.slice(0, 4));
      const list = byYear.get(y) ?? [];
      list.push(d);
      byYear.set(y, list);
    }

    let upserted = 0;
    const years: Array<{ year: number; days: number; upserted: number }> = [];

    for (const [year, yearDays] of [...byYear.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      const onlyDays = new Set(yearDays);
      const startDate = yearDays[0]!;
      const endDate = yearDays[yearDays.length - 1]!;
      const today = new Date().toISOString().slice(0, 10);
      const cappedEnd = endDate > today ? today : endDate;
      if (startDate > today) {
        years.push({ year, days: yearDays.length, upserted: 0 });
        continue;
      }

      try {
        const result = await syncWeatherRange({
          startDate,
          endDate: cappedEnd < startDate ? startDate : cappedEnd,
          onlyDays,
        });
        upserted += result.upserted;
        years.push({
          year,
          days: yearDays.length,
          upserted: result.upserted,
        });
      } catch (yearErr) {
        years.push({
          year,
          days: yearDays.length,
          upserted: 0,
        });
        console.error(
          `weather year ${year}`,
          yearErr instanceof Error ? yearErr.message : yearErr,
        );
      }
    }

    return {
      ok: upserted > 0 || years.every((y) => y.upserted >= 0),
      eventDays: days.length,
      upserted,
      years,
      error:
        upserted === 0
          ? "Geen weerdagen opgeslagen — check Open-Meteo"
          : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      eventDays: 0,
      upserted: 0,
      years: [],
      error: e instanceof Error ? e.message : "Weather sync mislukt",
    };
  }
}

/**
 * Vul ontbrekende eventdagen vanaf `fromYear` (default 2025).
 * Slaat dagen over die al in weather_daily staan.
 */
export async function ensureEditionWeather(options?: {
  fromYear?: number;
}): Promise<{
  needed: number;
  missing: number;
  upserted: number;
}> {
  const fromYear = options?.fromYear ?? 2025;
  const today = new Date().toISOString().slice(0, 10);
  const allDays = (await listEditionEventDays()).filter((d) => {
    const y = Number(d.slice(0, 4));
    return y >= fromYear && d <= today;
  });

  if (!allDays.length) {
    return { needed: 0, missing: 0, upserted: 0 };
  }

  const existing = await listWeatherDays({
    startDate: allDays[0]!,
    endDate: allDays[allDays.length - 1]!,
  });
  const have = new Set(existing.map((r) => r.day));
  const missing = allDays.filter((d) => !have.has(d));

  if (!missing.length) {
    return { needed: allDays.length, missing: 0, upserted: 0 };
  }

  const result = await syncWeatherRange({
    startDate: missing[0]!,
    endDate: missing[missing.length - 1]!,
    onlyDays: new Set(missing),
  });

  return {
    needed: allDays.length,
    missing: missing.length,
    upserted: result.upserted,
  };
}

export type WeatherRecord = {
  day: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  precipMm: number | null;
  windMaxMps: number | null;
  weatherCode: number | null;
};

export async function listWeatherDays(options: {
  startDate: string;
  endDate: string;
}): Promise<WeatherRecord[]> {
  if (!hasDatabase()) return [];

  const db = getDb();
  const start = dayToDate(options.startDate);
  const end = dayToDate(options.endDate);
  const rows = await db
    .select()
    .from(weatherDaily)
    .where(
      and(
        weatherLocationMatch(),
        gte(weatherDaily.day, start),
        lte(weatherDaily.day, end),
      ),
    )
    .orderBy(weatherDaily.day);

  return rows.map((r) => ({
    day: amsterdamDay(r.day) || r.day.toISOString().slice(0, 10),
    tempMinC: r.tempMinC != null ? Number(r.tempMinC) : null,
    tempMaxC: r.tempMaxC != null ? Number(r.tempMaxC) : null,
    precipMm: r.precipMm != null ? Number(r.precipMm) : null,
    windMaxMps: r.windMaxMps != null ? Number(r.windMaxMps) : null,
    weatherCode: r.weatherCode,
  }));
}

export type ExternalEventRecord = {
  id: string;
  name: string;
  type: "festival" | "holiday" | "other";
  startsAt: string;
  endsAt: string | null;
  region: string;
  impactNote: string | null;
  source: string;
};

export async function listExternalEvents(options?: {
  startDate?: string;
  endDate?: string;
}): Promise<ExternalEventRecord[]> {
  if (!hasDatabase()) {
    return SEED_EXTERNAL_EVENTS;
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(externalEvents)
    .orderBy(externalEvents.startsAt);
  let mapped = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    region: r.region,
    impactNote: r.impactNote,
    source: r.source,
  }));

  if (options?.startDate && options?.endDate) {
    const start = new Date(options.startDate).getTime();
    const end = new Date(options.endDate).getTime();
    mapped = mapped.filter((e) => {
      const s = new Date(e.startsAt).getTime();
      const eEnd = e.endsAt ? new Date(e.endsAt).getTime() : s;
      return eEnd >= start && s <= end;
    });
  }

  if (!mapped.length) {
    await seedExternalEventsIfEmpty();
    return listExternalEvents(options);
  }

  return mapped;
}

/** Grote NL/AMS concurrenten — curated seed (geen scraping). */
export const SEED_EXTERNAL_EVENTS: ExternalEventRecord[] = [
  ...[2021, 2022, 2023, 2024, 2025, 2026].map((y) => ({
    id: `seed-ade-${y}`,
    name: `Amsterdam Dance Event ${y}`,
    type: "festival" as const,
    startsAt: `${y}-10-15T00:00:00+02:00`,
    endsAt: `${y}-10-19T23:59:00+02:00`,
    region: "Amsterdam",
    impactNote:
      "City-wide electronic week — sterke concurrentie op aandacht & hotels",
    source: "manual-curated",
  })),
  {
    id: "seed-awakenings-2022",
    name: "Awakenings Festival 2022",
    type: "festival",
    startsAt: "2022-07-01T12:00:00+02:00",
    endsAt: "2022-07-03T23:00:00+02:00",
    region: "Spaarnwoude",
    impactNote: "Grote techno outdoor — overlap summer crowd",
    source: "manual-curated",
  },
  {
    id: "seed-awakenings-2023",
    name: "Awakenings Festival 2023",
    type: "festival",
    startsAt: "2023-06-30T12:00:00+02:00",
    endsAt: "2023-07-02T23:00:00+02:00",
    region: "Spaarnwoude",
    impactNote: "Grote techno outdoor — overlap summer crowd",
    source: "manual-curated",
  },
  {
    id: "seed-awakenings-2024",
    name: "Awakenings Festival 2024",
    type: "festival",
    startsAt: "2024-07-12T12:00:00+02:00",
    endsAt: "2024-07-14T23:00:00+02:00",
    region: "Spaarnwoude",
    impactNote: "Grote techno outdoor — overlap summer crowd",
    source: "manual-curated",
  },
  {
    id: "seed-awakenings-2025",
    name: "Awakenings Festival 2025",
    type: "festival",
    startsAt: "2025-07-11T12:00:00+02:00",
    endsAt: "2025-07-13T23:00:00+02:00",
    region: "Spaarnwoude",
    impactNote: "Grote techno outdoor — overlap summer crowd",
    source: "manual-curated",
  },
  {
    id: "seed-awakenings-2026",
    name: "Awakenings Festival 2026",
    type: "festival",
    startsAt: "2026-07-10T12:00:00+02:00",
    endsAt: "2026-07-12T23:00:00+02:00",
    region: "Spaarnwoude",
    impactNote: "Grote techno outdoor — overlap summer crowd",
    source: "manual-curated",
  },
  {
    id: "seed-mysteryland-2022",
    name: "Mysteryland 2022",
    type: "festival",
    startsAt: "2022-08-27T12:00:00+02:00",
    endsAt: "2022-08-28T23:00:00+02:00",
    region: "Haarlemmermeer",
    impactNote: "Weekend concurrentie summer",
    source: "manual-curated",
  },
  {
    id: "seed-mysteryland-2023",
    name: "Mysteryland 2023",
    type: "festival",
    startsAt: "2023-08-26T12:00:00+02:00",
    endsAt: "2023-08-27T23:00:00+02:00",
    region: "Haarlemmermeer",
    impactNote: "Weekend concurrentie summer",
    source: "manual-curated",
  },
  {
    id: "seed-mysteryland-2024",
    name: "Mysteryland 2024",
    type: "festival",
    startsAt: "2024-08-24T12:00:00+02:00",
    endsAt: "2024-08-25T23:00:00+02:00",
    region: "Haarlemmermeer",
    impactNote: "Weekend concurrentie summer",
    source: "manual-curated",
  },
  {
    id: "seed-mysteryland-2025",
    name: "Mysteryland 2025",
    type: "festival",
    startsAt: "2025-08-23T12:00:00+02:00",
    endsAt: "2025-08-24T23:00:00+02:00",
    region: "Haarlemmermeer",
    impactNote: "Weekend concurrentie summer",
    source: "manual-curated",
  },
  {
    id: "seed-mysteryland-2026",
    name: "Mysteryland 2026",
    type: "festival",
    startsAt: "2026-08-22T12:00:00+02:00",
    endsAt: "2026-08-23T23:00:00+02:00",
    region: "Haarlemmermeer",
    impactNote: "Weekend concurrentie summer",
    source: "manual-curated",
  },
  {
    id: "seed-dekmantel-2022",
    name: "Dekmantel Festival 2022",
    type: "festival",
    startsAt: "2022-08-03T12:00:00+02:00",
    endsAt: "2022-08-07T23:00:00+02:00",
    region: "Amsterdam",
    impactNote: "Sterke AMS electronic concurrentie",
    source: "manual-curated",
  },
  {
    id: "seed-dekmantel-2023",
    name: "Dekmantel Festival 2023",
    type: "festival",
    startsAt: "2023-08-02T12:00:00+02:00",
    endsAt: "2023-08-06T23:00:00+02:00",
    region: "Amsterdam",
    impactNote: "Sterke AMS electronic concurrentie",
    source: "manual-curated",
  },
  {
    id: "seed-dekmantel-2024",
    name: "Dekmantel Festival 2024",
    type: "festival",
    startsAt: "2024-07-31T12:00:00+02:00",
    endsAt: "2024-08-04T23:00:00+02:00",
    region: "Amsterdam",
    impactNote: "Sterke AMS electronic concurrentie",
    source: "manual-curated",
  },
  {
    id: "seed-dekmantel-2025",
    name: "Dekmantel Festival 2025",
    type: "festival",
    startsAt: "2025-07-30T12:00:00+02:00",
    endsAt: "2025-08-03T23:00:00+02:00",
    region: "Amsterdam",
    impactNote: "Sterke AMS electronic concurrentie",
    source: "manual-curated",
  },
  {
    id: "seed-dekmantel-2026",
    name: "Dekmantel Festival 2026",
    type: "festival",
    startsAt: "2026-07-29T12:00:00+02:00",
    endsAt: "2026-08-02T23:00:00+02:00",
    region: "Amsterdam",
    impactNote: "Sterke AMS electronic concurrentie",
    source: "manual-curated",
  },
  {
    id: "seed-dgtl-2024",
    name: "DGTL Amsterdam 2024",
    type: "festival",
    startsAt: "2024-04-06T12:00:00+02:00",
    endsAt: "2024-04-07T23:00:00+02:00",
    region: "Amsterdam NDSM",
    impactNote: "Voorjaars concurrentie AMS",
    source: "manual-curated",
  },
  {
    id: "seed-dgtl-2025",
    name: "DGTL Amsterdam 2025",
    type: "festival",
    startsAt: "2025-04-19T12:00:00+02:00",
    endsAt: "2025-04-20T23:00:00+02:00",
    region: "Amsterdam NDSM",
    impactNote: "Voorjaars concurrentie AMS",
    source: "manual-curated",
  },
  {
    id: "seed-dgtl-2026",
    name: "DGTL Amsterdam 2026",
    type: "festival",
    startsAt: "2026-04-11T12:00:00+02:00",
    endsAt: "2026-04-12T23:00:00+02:00",
    region: "Amsterdam NDSM",
    impactNote: "Voorjaars concurrentie AMS",
    source: "manual-curated",
  },
  ...[2021, 2022, 2023, 2024, 2025, 2026].map((y) => ({
    id: `seed-kingsday-${y}`,
    name: `Koningsdag ${y}`,
    type: "holiday" as const,
    startsAt: `${y}-04-27T00:00:00+02:00`,
    endsAt: `${y}-04-27T23:59:00+02:00`,
    region: "Nederland",
    impactNote: "Nationale feestdag — andere uitgaansdynamiek",
    source: "manual-curated",
  })),
];

export async function seedExternalEventsIfEmpty(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const existing = await db
    .select({ id: externalEvents.id })
    .from(externalEvents)
    .limit(1);
  if (existing.length) return 0;
  return upsertCuratedExternalEvents();
}

/** Voeg curated festivals toe zonder duplicaten. */
export async function upsertCuratedExternalEvents(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const existing = await db.select().from(externalEvents);
  const byKey = new Set(
    existing.map(
      (e) =>
        `${e.name.toLowerCase()}|${e.startsAt.toISOString().slice(0, 10)}`,
    ),
  );

  let inserted = 0;
  for (const e of SEED_EXTERNAL_EVENTS) {
    const key = `${e.name.toLowerCase()}|${e.startsAt.slice(0, 10)}`;
    if (byKey.has(key)) continue;
    await db.insert(externalEvents).values({
      name: e.name,
      type: e.type,
      startsAt: new Date(e.startsAt),
      endsAt: e.endsAt ? new Date(e.endsAt) : null,
      region: e.region,
      impactNote: e.impactNote,
      source: e.source,
    });
    inserted += 1;
  }
  return inserted;
}
