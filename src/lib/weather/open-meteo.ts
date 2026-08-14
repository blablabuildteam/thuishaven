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
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: options.startDate,
    end_date: options.endDate,
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
    // Forecast endpoint als archive faalt (recente/toekomstige dagen)
    const forecast = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: options.startDate,
      end_date: options.endDate,
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
      throw new Error(`Open-Meteo HTTP ${res.status}/${fres.status}`);
    }
    return parseDaily((await fres.json()) as OpenMeteoDaily);
  }

  return parseDaily((await res.json()) as OpenMeteoDaily);
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
