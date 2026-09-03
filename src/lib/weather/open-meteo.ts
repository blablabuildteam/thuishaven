/**
 * Open-Meteo — gratis weer-API, geen key.
 * Default: Thuishaven-omgeving (Contactweg / Westpoort, Amsterdam).
 * Geen dakniveau-precisie nodig — dagelijkse regio-waarden volstaan.
 */
import { shiftIsoDay } from "@/lib/time/amsterdam";

export const AMS = {
  locationKey: "thuishaven",
  locationLabel: "Thuishaven · Contactweg (AMS)",
  latitude: 52.3968,
  longitude: 4.8564,
} as const;

export type WeatherDayRow = {
  day: string; // YYYY-MM-DD
  tempMinC: number | null;
  tempMaxC: number | null;
  precipMm: number | null;
  windMaxMps: number | null;
  weatherCode: number | null;
  raw: Record<string, unknown>;
};

type OpenMeteoDaily = {
  daily?: {
    time: string[];
    temperature_2m_min?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    weather_code?: (number | null)[];
  };
};

export async function fetchOpenMeteoRange(options: {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  latitude?: number;
  longitude?: number;
}): Promise<WeatherDayRow[]> {
  const lat = options.latitude ?? AMS.latitude;
  const lon = options.longitude ?? AMS.longitude;

  async function once(startDate: string, endDate: string): Promise<WeatherDayRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    // Archive lags ~2–5 dagen; recent + toekomst → forecast API.
    const archiveSafeEnd = shiftDay(today, -5);
    const useForecast = endDate > archiveSafeEnd;

    if (!useForecast) {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        start_date: startDate,
        end_date: endDate,
        daily:
          "temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max,weather_code",
        timezone: "Europe/Amsterdam",
        wind_speed_unit: "ms",
      });
      const res = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?${params}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        return parseDaily((await res.json()) as OpenMeteoDaily);
      }
    }

    const forecast = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: startDate,
      end_date: endDate,
      daily:
        "temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max,weather_code",
      timezone: "Europe/Amsterdam",
      wind_speed_unit: "ms",
    });
    const fres = await fetch(
      `https://api.open-meteo.com/v1/forecast?${forecast}`,
      { cache: "no-store" },
    );
    if (!fres.ok) {
      // Laatste poging: archive voor het verleden-deel
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        start_date: startDate,
        end_date: endDate < archiveSafeEnd ? endDate : archiveSafeEnd,
        daily:
          "temperature_2m_min,temperature_2m_max,precipitation_sum,wind_speed_10m_max,weather_code",
        timezone: "Europe/Amsterdam",
        wind_speed_unit: "ms",
      });
      const res = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?${params}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error(`Open-Meteo HTTP ${fres.status}/${res.status}`);
      }
      return parseDaily((await res.json()) as OpenMeteoDaily);
    }
    return parseDaily((await fres.json()) as OpenMeteoDaily);
  }

  function shiftDay(iso: string, delta: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  // Grote ranges soms 4xx/5xx — split in ~90-daagse chunks
  const start = new Date(`${options.startDate}T12:00:00Z`);
  const end = new Date(`${options.endDate}T12:00:00Z`);
  if (end < start) return [];

  const out: WeatherDayRow[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 89);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    const a = cursor.toISOString().slice(0, 10);
    const b = chunkEnd.toISOString().slice(0, 10);
    const part = await once(a, b);
    out.push(...part);
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function parseDaily(data: OpenMeteoDaily): WeatherDayRow[] {
  const d = data.daily;
  if (!d?.time?.length) return [];
  return d.time.map((day, i) => ({
    day,
    tempMinC: d.temperature_2m_min?.[i] ?? null,
    tempMaxC: d.temperature_2m_max?.[i] ?? null,
    precipMm: d.precipitation_sum?.[i] ?? null,
    windMaxMps: d.wind_speed_10m_max?.[i] ?? null,
    weatherCode: d.weather_code?.[i] ?? null,
    raw: {
      tempMin: d.temperature_2m_min?.[i],
      tempMax: d.temperature_2m_max?.[i],
      precip: d.precipitation_sum?.[i],
      wind: d.wind_speed_10m_max?.[i],
      code: d.weather_code?.[i],
    },
  }));
}

/** WMO weather interpretation codes — compact NL label. */
export function weatherCodeLabel(code: number | null | undefined): string {
  if (code == null) return "Onbekend";
  if (code === 0) return "Helder";
  if (code <= 3) return "Deels bewolkt";
  if (code <= 48) return "Mistig";
  if (code <= 57) return "Motregen";
  if (code <= 67) return "Regen";
  if (code <= 77) return "Sneeuw";
  if (code <= 82) return "Buien";
  if (code <= 86) return "Sneeuwbuien";
  if (code <= 99) return "Onweer";
  return `Code ${code}`;
}

/** Coarse icon bucket for hourly WMO codes. */
export type WeatherCodeIconKind =
  | "clear"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

export function weatherCodeIconKind(
  code: number | null | undefined,
): WeatherCodeIconKind {
  if (code == null) return "cloudy";
  if (code === 0) return "clear";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain";
  if (code <= 86) return "snow";
  if (code <= 99) return "thunder";
  return "cloudy";
}

export type WeatherHourRow = {
  /** YYYY-MM-DD (Europe/Amsterdam). */
  day: string;
  /** 0–23 local hour. */
  hour: number;
  tempC: number | null;
  precipMm: number | null;
  weatherCode: number | null;
  label: string;
  iconKind: WeatherCodeIconKind;
};

type OpenMeteoHourly = {
  hourly?: {
    time: string[];
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    weather_code?: (number | null)[];
  };
};

/**
 * Hourly AMS weather for a calendar range (archive + forecast).
 * Used for Insights event-day strips — not persisted.
 */
export async function fetchOpenMeteoHourlyRange(options: {
  startDate: string;
  endDate: string;
  latitude?: number;
  longitude?: number;
}): Promise<WeatherHourRow[]> {
  const lat = options.latitude ?? AMS.latitude;
  const lon = options.longitude ?? AMS.longitude;

  function shiftDay(iso: string, delta: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  async function once(
    startDate: string,
    endDate: string,
  ): Promise<WeatherHourRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const archiveSafeEnd = shiftDay(today, -5);
    // Open-Meteo forecast API covers ~16 days ahead
    const forecastMaxEnd = shiftDay(today, 16);
    const useForecast = endDate > archiveSafeEnd;

    // If entire range is beyond forecast window, return empty (no data available yet)
    if (startDate > forecastMaxEnd) {
      return [];
    }

    const hourlyVars = "temperature_2m,precipitation,weather_code";

    async function fromUrl(url: string): Promise<WeatherHourRow[] | null> {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      return parseHourly((await res.json()) as OpenMeteoHourly);
    }

    if (!useForecast) {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        start_date: startDate,
        end_date: endDate,
        hourly: hourlyVars,
        timezone: "Europe/Amsterdam",
      });
      const rows = await fromUrl(
        `https://archive-api.open-meteo.com/v1/archive?${params}`,
      );
      if (rows) return rows;
    }

    // Cap endDate to forecast window to avoid API errors
    const cappedEnd = endDate > forecastMaxEnd ? forecastMaxEnd : endDate;

    const forecast = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: startDate,
      end_date: cappedEnd,
      hourly: hourlyVars,
      timezone: "Europe/Amsterdam",
    });
    const forecastRows = await fromUrl(
      `https://api.open-meteo.com/v1/forecast?${forecast}`,
    );
    if (forecastRows) return forecastRows;

    const archiveEnd = endDate < archiveSafeEnd ? endDate : archiveSafeEnd;
    if (archiveEnd >= startDate) {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        start_date: startDate,
        end_date: archiveEnd,
        hourly: hourlyVars,
        timezone: "Europe/Amsterdam",
      });
      const rows = await fromUrl(
        `https://archive-api.open-meteo.com/v1/archive?${params}`,
      );
      if (rows) return rows;
    }

    // Return empty instead of throwing — dates may be too far in future
    console.warn(`[weather] No data available for ${startDate}–${endDate}`);
    return [];
  }

  const start = new Date(`${options.startDate}T12:00:00Z`);
  const end = new Date(`${options.endDate}T12:00:00Z`);
  if (end < start) return [];

  const out: WeatherHourRow[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 14);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    const a = cursor.toISOString().slice(0, 10);
    const b = chunkEnd.toISOString().slice(0, 10);
    out.push(...(await once(a, b)));
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function parseHourly(data: OpenMeteoHourly): WeatherHourRow[] {
  const h = data.hourly;
  if (!h?.time?.length) return [];
  return h.time.map((time, i) => {
    const day = time.slice(0, 10);
    const hour = Number(time.slice(11, 13));
    const code = h.weather_code?.[i] ?? null;
    return {
      day,
      hour: Number.isFinite(hour) ? hour : 0,
      tempC: h.temperature_2m?.[i] ?? null,
      precipMm: h.precipitation?.[i] ?? null,
      weatherCode: code,
      label: weatherCodeLabel(code),
      iconKind: weatherCodeIconKind(code),
    };
  });
}

/**
 * Hourly rows for specific calendar days (deduped), keyed by YYYY-MM-DD.
 * Chunks sparse day lists so we don't pull multi-year ranges for a few events.
 */
export async function fetchOpenMeteoHourlyForDays(
  days: string[],
): Promise<Map<string, WeatherHourRow[]>> {
  const out = new Map<string, WeatherHourRow[]>();
  // Open-Meteo forecast API only covers ~16 days ahead — skip dates beyond that
  const today = new Date().toISOString().slice(0, 10);
  const forecastMaxEnd = shiftIsoDay(today, 16);
  const wanted = [...new Set(days.filter(Boolean))]
    .filter((d) => d <= forecastMaxEnd)
    .sort();
  if (!wanted.length) return out;

  // Group into runs where gaps are ≤ 3 days to keep archive requests small.
  const runs: Array<{ start: string; end: string; days: string[] }> = [];
  for (const day of wanted) {
    const last = runs[runs.length - 1];
    if (!last) {
      runs.push({ start: day, end: day, days: [day] });
      continue;
    }
    const prev = new Date(`${last.end}T12:00:00Z`);
    const cur = new Date(`${day}T12:00:00Z`);
    const gapDays =
      (cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);
    if (gapDays <= 3) {
      last.end = day;
      last.days.push(day);
    } else {
      runs.push({ start: day, end: day, days: [day] });
    }
  }

  for (const run of runs) {
    try {
      const rows = await fetchOpenMeteoHourlyRange({
        startDate: run.start,
        endDate: run.end,
      });
      const want = new Set(run.days);
      for (const row of rows) {
        if (!want.has(row.day)) continue;
        const list = out.get(row.day) ?? [];
        list.push(row);
        out.set(row.day, list);
      }
    } catch (err) {
      console.error(
        `[weather] hourly fetch failed ${run.start}–${run.end}`,
        err,
      );
    }
  }

  for (const [day, list] of out) {
    list.sort((a, b) => a.hour - b.hour);
    out.set(day, list);
  }
  return out;
}

export async function pingOpenMeteo(): Promise<{ ok: boolean; message: string }> {
  try {
    const today = new Date();
    const y = today.toISOString().slice(0, 10);
    const rows = await fetchOpenMeteoRange({ startDate: y, endDate: y });
    if (!rows.length) return { ok: false, message: "Geen data terug" };
    return {
      ok: true,
      message: `OK · ${rows[0].tempMaxC ?? "?"}°C max vandaag (AMS)`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Open-Meteo onbereikbaar",
    };
  }
}
