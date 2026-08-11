import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { externalEvents, weatherDaily } from "@/lib/db/schema";
import {
  AMS,
  fetchOpenMeteoRange,
  type WeatherDayRow,
} from "@/lib/weather/open-meteo";

function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

export async function syncWeatherRange(options: {
  startDate: string;
  endDate: string;
}): Promise<{ upserted: number; rows: WeatherDayRow[] }> {
  const rows = await fetchOpenMeteoRange(options);
  if (!hasDatabase()) {
    return { upserted: 0, rows };
  }

  const db = getDb();
  let upserted = 0;
  for (const row of rows) {
    const day = dayToDate(row.day);
    const existing = await db
      .select({ id: weatherDaily.id })
      .from(weatherDaily)
      .where(
        and(
          eq(weatherDaily.locationKey, AMS.locationKey),
          sql`(${weatherDaily.day})::date = ${row.day}::date`,
        ),
      )
      .limit(1);

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
      raw: row.raw,
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

  return { upserted, rows };
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
        eq(weatherDaily.locationKey, AMS.locationKey),
        gte(weatherDaily.day, start),
        lte(weatherDaily.day, end),
      ),
    )
    .orderBy(weatherDaily.day);

  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
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
  const rows = await db.select().from(externalEvents).orderBy(externalEvents.startsAt);
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

export const SEED_EXTERNAL_EVENTS: ExternalEventRecord[] = [
  {
    id: "seed-ade-2025",
    name: "Amsterdam Dance Event",
    type: "festival",
    startsAt: "2025-10-15T00:00:00+02:00",
    endsAt: "2025-10-19T23:59:00+02:00",
    region: "Amsterdam",
    impactNote: "Grote concurrentie op attention + hotelcapaciteit in AMS",
    source: "manual",
  },
  {
    id: "seed-awakenings-2026",
    name: "Awakenings Festival",
    type: "festival",
    startsAt: "2026-07-10T12:00:00+02:00",
    endsAt: "2026-07-12T23:00:00+02:00",
    region: "Spaarnwoude / AMS regio",
    impactNote: "Overlap met summer outdoor-publiek",
    source: "manual",
  },
  {
    id: "seed-mysteryland-2026",
    name: "Mysteryland",
    type: "festival",
    startsAt: "2026-08-22T12:00:00+02:00",
    endsAt: "2026-08-23T23:00:00+02:00",
    region: "Haarlemmermeer",
    impactNote: "Weekend concurrentie voor Summer Special-achtige edities",
    source: "manual",
  },
  {
    id: "seed-kingsday-2026",
    name: "Koningsdag",
    type: "holiday",
    startsAt: "2026-04-27T00:00:00+02:00",
    endsAt: "2026-04-27T23:59:00+02:00",
    region: "Nederland",
    impactNote: "Nationale feestdag — andere uitgaansdynamiek",
    source: "manual",
  },
];

export async function seedExternalEventsIfEmpty(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const existing = await db.select({ id: externalEvents.id }).from(externalEvents).limit(1);
  if (existing.length) return 0;

  for (const e of SEED_EXTERNAL_EVENTS) {
    await db.insert(externalEvents).values({
      name: e.name,
      type: e.type,
      startsAt: new Date(e.startsAt),
      endsAt: e.endsAt ? new Date(e.endsAt) : null,
      region: e.region,
      impactNote: e.impactNote,
      source: e.source,
    });
  }
  return SEED_EXTERNAL_EVENTS.length;
}
