import { salesByDay } from "@/lib/mock/dashboard";
import {
  listExternalEvents,
  listWeatherDays,
  seedExternalEventsIfEmpty,
  syncWeatherRange,
  type ExternalEventRecord,
  type WeatherRecord,
} from "@/lib/weather/store";
import { weatherCodeLabel } from "@/lib/weather/open-meteo";
import {
  scoreFestivalWeather,
  type FestivalWeatherScore,
} from "@/lib/weather/festival-score";
import { hasDatabase } from "@/lib/db/client";

export type SalesContextDay = {
  date: string;
  label: string;
  tickets: number;
  tempMaxC: number | null;
  precipMm: number | null;
  windMaxMps: number | null;
  weatherLabel: string;
  festivalWeather: FestivalWeatherScore;
  note: string | null;
};

export type SalesContextBundle = {
  days: SalesContextDay[];
  festivals: ExternalEventRecord[];
  weatherSynced: number;
  hasDb: boolean;
  insight: string;
  avgFestivalScore: number | null;
};

function isoDaysBack(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function overlaps(
  dayIso: string,
  event: ExternalEventRecord,
): boolean {
  const t = new Date(`${dayIso}T12:00:00`).getTime();
  const start = new Date(event.startsAt).getTime();
  const end = event.endsAt
    ? new Date(event.endsAt).getTime()
    : start + 24 * 60 * 60 * 1000;
  return t >= start && t <= end;
}

function buildInsight(
  days: SalesContextDay[],
  festivals: ExternalEventRecord[],
): string {
  const parts: string[] = [];

  const scores = days.map((d) => d.festivalWeather.score);
  if (scores.length) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const best = [...days].sort(
      (a, b) => b.festivalWeather.score - a.festivalWeather.score,
    )[0];
    const worst = [...days].sort(
      (a, b) => a.festivalWeather.score - b.festivalWeather.score,
    )[0];
    parts.push(
      `Gemiddelde festival-weer score: ${avg.toFixed(1)}/10. Beste dag: ${best.label} (${best.festivalWeather.score}/10 · ${best.festivalWeather.label}). Zwakste: ${worst.label} (${worst.festivalWeather.score}/10).`,
    );
  }

  const rainy = days.filter((d) => (d.precipMm ?? 0) >= 2);
  const rainyAvg =
    rainy.length > 0
      ? rainy.reduce((s, d) => s + d.tickets, 0) / rainy.length
      : null;
  const dry = days.filter((d) => (d.precipMm ?? 0) < 2);
  const dryAvg =
    dry.length > 0
      ? dry.reduce((s, d) => s + d.tickets, 0) / dry.length
      : null;

  if (rainyAvg != null && dryAvg != null && dry.length && rainy.length) {
    const delta = ((dryAvg - rainyAvg) / dryAvg) * 100;
    if (Math.abs(delta) >= 8) {
      parts.push(
        delta > 0
          ? `Op droge dagen gemiddeld ~${Math.round(delta)}% meer tickets dan op natte dagen (mock-verkoop × live weer).`
          : `Op natte dagen liep verkoop ~${Math.round(Math.abs(delta))}% hoger — check of indoor-edities/weer-comms meespeelden.`,
      );
    }
  }

  if (festivals.length) {
    parts.push(
      `${festivals.length} concurrerende event(s) in/rond deze periode (o.a. ${festivals[0].name}).`,
    );
  }

  if (!parts.length) {
    parts.push(
      "Nog weinig contrast in weer vs verkoop — sync meer dagen of koppel live ticketdata.",
    );
  }
  return parts.join(" ");
}

/** Combineert mock/live ticketdagen met weer + festivals. */
export async function getSalesContextBundle(): Promise<SalesContextBundle> {
  const endDate = isoDaysBack(0);
  const startDate = isoDaysBack(13);
  let weatherSynced = 0;

  if (hasDatabase()) {
    try {
      await seedExternalEventsIfEmpty();
      const sync = await syncWeatherRange({ startDate, endDate });
      weatherSynced = sync.upserted;
    } catch (e) {
      console.error("weather sync", e);
    }
  }

  let weather: WeatherRecord[] = [];
  try {
    weather = await listWeatherDays({ startDate, endDate });
  } catch {
    weather = [];
  }

  // Als DB leeg is maar sync wel rows terug gaf buiten DB — gebruik sync niet;
  // fallback: haal live open-meteo voor display zonder persist
  if (!weather.length) {
    try {
      const { fetchOpenMeteoRange } = await import("@/lib/weather/open-meteo");
      const live = await fetchOpenMeteoRange({ startDate, endDate });
      weather = live.map((r) => ({
        day: r.day,
        tempMinC: r.tempMinC,
        tempMaxC: r.tempMaxC,
        precipMm: r.precipMm,
        windMaxMps: r.windMaxMps,
        weatherCode: r.weatherCode,
      }));
    } catch {
      weather = [];
    }
  }

  const weatherByDay = new Map(weather.map((w) => [w.day, w]));
  const mockWindow = salesByDay.slice(-7);
  const days: SalesContextDay[] = mockWindow.map((row, i) => {
    const offset = mockWindow.length - 1 - i;
    const date = isoDaysBack(offset);
    const w = weatherByDay.get(date);
    const tickets = row.weeztix + row.ra + row.appic + row.ticketswap;
    const festivalWeather = scoreFestivalWeather({
      day: date,
      tempMinC: w?.tempMinC ?? null,
      tempMaxC: w?.tempMaxC ?? null,
      precipMm: w?.precipMm ?? null,
      windMaxMps: w?.windMaxMps ?? null,
      weatherCode: w?.weatherCode ?? null,
    });
    return {
      date,
      label: formatDayLabel(date),
      tickets,
      tempMaxC: w?.tempMaxC ?? null,
      precipMm: w?.precipMm ?? null,
      windMaxMps: w?.windMaxMps ?? null,
      weatherLabel: weatherCodeLabel(w?.weatherCode),
      festivalWeather,
      note: null,
    };
  });

  // Chronological
  days.reverse();

  const festivals = await listExternalEvents({
    startDate: isoDaysBack(30),
    endDate: isoDaysBack(-60), // ~2 months ahead
  });

  // Annotate overlapping festival names on days
  for (const d of days) {
    const hit = festivals.find((f) => overlaps(d.date, f));
    if (hit) d.note = hit.name;
  }

  // Festivals relevant to next 60 days + past 30
  const relevant = festivals.filter((f) => {
    const s = new Date(f.startsAt).getTime();
    return s >= Date.now() - 30 * 86400000 && s <= Date.now() + 60 * 86400000;
  });

  const avgFestivalScore =
    days.length > 0
      ? days.reduce((s, d) => s + d.festivalWeather.score, 0) / days.length
      : null;

  return {
    days,
    festivals: relevant.length ? relevant : festivals.slice(0, 4),
    weatherSynced,
    hasDb: hasDatabase(),
    insight: buildInsight(days, relevant),
    avgFestivalScore,
  };
}
