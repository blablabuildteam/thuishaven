/**
 * Open-Meteo — gratis weer-API, geen key.
 * Default: Thuishaven-omgeving (Contactweg / Westpoort, Amsterdam).
 * Geen dakniveau-precisie nodig — dagelijkse regio-waarden volstaan.
 */
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
