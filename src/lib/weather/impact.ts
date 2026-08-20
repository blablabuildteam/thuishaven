import { and, eq, gte, isNotNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  ticketInventory,
  ticketSalesDaily,
  weatherDaily,
} from "@/lib/db/schema";
import {
  amsterdamDay,
  isOutdoorSeason,
  shiftIsoDay,
} from "@/lib/time/amsterdam";
import {
  classifyEventWeather,
  weatherKindLabel,
  type ClassifiedWeather,
  type WeatherKind,
} from "@/lib/weather/classify";
import { parseEditionLineup } from "@/lib/editions/lineup";
import { ensureEditionWeather, weatherLocationMatch } from "@/lib/weather/store";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";

const FROM_YEAR = 2025;

export type WeatherImpactEvent = {
  editionId: string;
  name: string;
  headliner: string | null;
  day: string;
  kind: string;
  sold: number;
  capacity: number | null;
  fill: number | null;
  lastWeekSold: number | null;
  weather: ClassifiedWeather;
};

export type WeatherBucket = {
  kind: WeatherKind;
  label: string;
  n: number;
  avgSold: number;
  avgFill: number | null;
  avgLastWeekSold: number | null;
  vsComfortPct: number | null;
};

export type WeatherImpact = {
  fromYear: number;
  synced: { needed: number; missing: number; upserted: number };
  coverage: { editions: number; withWeather: number };
  outdoor: {
    n: number;
    avgSold: number;
    buckets: WeatherBucket[];
  };
  extremes: WeatherImpactEvent[];
  verdict: { title: string; body: string; evidence: string };
};

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function asIsoDay(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return amsterdamDay(value) || value.toISOString().slice(0, 10);
}

function bucketEvents(
  events: WeatherImpactEvent[],
  comfortAvg: number | null,
): WeatherBucket[] {
  const kinds: WeatherKind[] = [
    "cold_wet",
    "wet",
    "cold",
    "heat",
    "windy",
    "ideal",
    "ok",
  ];
  return kinds
    .map((kind) => {
      const rows = events.filter((e) => e.weather.kind === kind);
      const avgSold = avg(rows.map((r) => r.sold));
      const fills = rows
        .map((r) => r.fill)
        .filter((x): x is number => x != null);
      const last = rows
        .map((r) => r.lastWeekSold)
        .filter((x): x is number => x != null);
      return {
        kind,
        label: weatherKindLabel(kind),
        n: rows.length,
        avgSold: avgSold != null ? Math.round(avgSold) : 0,
        avgFill: avg(fills),
        avgLastWeekSold: avg(last) != null ? Math.round(avg(last)!) : null,
        vsComfortPct:
          avgSold != null && comfortAvg && comfortAvg > 0
            ? ((avgSold - comfortAvg) / comfortAvg) * 100
            : null,
      };
    })
    .filter((b) => b.n > 0);
}

function buildVerdict(
  outdoor: WeatherImpactEvent[],
  buckets: WeatherBucket[],
): WeatherImpact["verdict"] {
  const comfort = buckets.filter(
    (b) => b.kind === "ideal" || b.kind === "ok",
  );
  const comfortN = comfort.reduce((s, b) => s + b.n, 0);
  const comfortAvg =
    comfortN > 0
      ? comfort.reduce((s, b) => s + b.avgSold * b.n, 0) / comfortN
      : null;
  const ideal = buckets.find((b) => b.kind === "ideal");

  const signals = buckets
    .filter(
      (b) =>
        (b.kind === "wet" ||
          b.kind === "heat" ||
          b.kind === "cold" ||
          b.kind === "cold_wet") &&
        b.n >= 3 &&
        b.vsComfortPct != null &&
        Math.abs(b.vsComfortPct) >= 8,
    )
    .sort(
      (a, b) =>
        Math.abs(b.vsComfortPct ?? 0) - Math.abs(a.vsComfortPct ?? 0),
    )
    .slice(0, 3);

  if (!signals.length) {
    return {
      title: "Weer zichtbaar — effect op totaal nog zacht",
      body: `Outdoor n=${outdoor.length} vanaf ${FROM_YEAR}.`,
      evidence: `comfort n=${comfortN}`,
    };
  }

  const bits = signals.map((b) => {
    const pct = Math.round(b.vsComfortPct!);
    return `${b.label.toLowerCase()} ${pct > 0 ? "+" : ""}${pct}%`;
  });
  if (ideal && ideal.n >= 5) {
    bits.push(`ideaal ${ideal.avgSold.toLocaleString("nl-NL")}`);
  }

  return {
    title: bits.join(" · "),
    body: `vs droog/comfort · mei–sept ${FROM_YEAR}+`,
    evidence: `n=${outdoor.length} · comfort n=${comfortN}${comfortAvg != null ? ` · ~${Math.round(comfortAvg)} sold` : ""}`,
  };
}

export async function getWeatherImpact(options?: {
  fromYear?: number;
  sync?: boolean;
}): Promise<WeatherImpact> {
  const fromYear = options?.fromYear ?? FROM_YEAR;
  const empty: WeatherImpact = {
    fromYear,
    synced: { needed: 0, missing: 0, upserted: 0 },
    coverage: { editions: 0, withWeather: 0 },
    outdoor: { n: 0, avgSold: 0, buckets: [] },
    extremes: [],
    verdict: {
      title: "Nog geen weer gekoppeld",
      body: "Sync Open-Meteo voor eventdagen vanaf 2025.",
      evidence: "",
    },
  };

  if (!hasDatabase()) return empty;

  let synced = { needed: 0, missing: 0, upserted: 0 };
  if (options?.sync !== false) {
    try {
      synced = await ensureEditionWeather({ fromYear });
    } catch (e) {
      console.error("weather ensure", e);
    }
  }

  const db = getDb();
  const from = new Date(`${fromYear}-01-01T00:00:00.000Z`);

  const eds = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
      sold: ticketInventory.sold,
      capacity: ticketInventory.capacity,
      available: ticketInventory.available,
    })
    .from(editions)
    .leftJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
      ),
    )
    .where(and(isNotNull(editions.weeztixEventId), gte(editions.startsAt, from)));

  const filtered = eds.filter((e) => !/TEMPLATE/i.test(e.name));
  if (!filtered.length) {
    return { ...empty, synced };
  }

  const weatherRows = await db
    .select()
    .from(weatherDaily)
    .where(
      and(
        weatherLocationMatch(),
        gte(weatherDaily.day, from),
      ),
    );
  const weatherByDay = new Map(
    weatherRows.map((w) => [asIsoDay(w.day), w]),
  );

  const dailyRows = await db
    .select({
      editionId: ticketSalesDaily.editionId,
      day: ticketSalesDaily.day,
      sold: ticketSalesDaily.sold,
    })
    .from(ticketSalesDaily)
    .where(eq(ticketSalesDaily.platform, "weeztix"));

  const dailyByEdition = new Map<string, Array<{ day: string; sold: number }>>();
  for (const r of dailyRows) {
    const list = dailyByEdition.get(r.editionId) ?? [];
    list.push({ day: asIsoDay(r.day), sold: r.sold });
    dailyByEdition.set(r.editionId, list);
  }

  const events: WeatherImpactEvent[] = [];
  for (const e of filtered) {
    const day = amsterdamDay(e.startsAt);
    const w = weatherByDay.get(day);
    if (!w) continue;
    const weather = classifyEventWeather({
      day,
      tempMinC: num(w.tempMinC),
      tempMaxC: num(w.tempMaxC),
      precipMm: num(w.precipMm),
      windMaxMps: num(w.windMaxMps),
      weatherCode: w.weatherCode,
    });
    const inv = normalizeWeeztixInventory({
      sold: e.sold,
      capacity: e.capacity,
      available: e.available,
    });
    const sold = inv.sold;
    const capacity = inv.capacity;
    const fill =
      capacity != null && capacity > 0 ? (sold / capacity) * 100 : null;
    const windowStart = shiftIsoDay(day, -6);
    const lastWeek = (dailyByEdition.get(e.id) ?? [])
      .filter((p) => p.day >= windowStart && p.day <= day)
      .reduce((s, p) => s + p.sold, 0);
    const lineup = parseEditionLineup(e.name);

    events.push({
      editionId: e.id,
      name: e.name,
      headliner: lineup.headliner,
      day,
      kind: lineup.kind,
      sold,
      capacity,
      fill,
      lastWeekSold: lastWeek > 0 ? lastWeek : null,
      weather,
    });
  }

  const outdoor = events.filter(
    (e) =>
      e.weather.outdoorSeason &&
      e.sold > 0 &&
      new Date(`${e.day}T23:59:00Z`).getTime() < Date.now(),
  );

  const comfortRows = outdoor.filter(
    (e) => e.weather.kind === "ideal" || e.weather.kind === "ok",
  );
  const comfortAvg = avg(comfortRows.map((r) => r.sold));
  const buckets = bucketEvents(outdoor, comfortAvg);
  const outdoorAvg = avg(outdoor.map((r) => r.sold)) ?? 0;

  const harshRank: Record<WeatherKind, number> = {
    cold_wet: 0,
    wet: 1,
    heat: 2,
    cold: 3,
    windy: 4,
    ok: 5,
    ideal: 6,
  };
  const extremes = [...outdoor]
    .filter(
      (e) =>
        e.weather.kind === "cold_wet" ||
        e.weather.kind === "wet" ||
        e.weather.kind === "heat" ||
        e.weather.kind === "cold",
    )
    .sort((a, b) => {
      const ka = harshRank[a.weather.kind];
      const kb = harshRank[b.weather.kind];
      if (ka !== kb) return ka - kb;
      const pa = a.weather.precipMm + (a.weather.kind === "heat" ? (a.weather.tempMaxC ?? 0) : 0);
      const pb = b.weather.precipMm + (b.weather.kind === "heat" ? (b.weather.tempMaxC ?? 0) : 0);
      return pb - pa;
    })
    .slice(0, 12);

  return {
    fromYear,
    synced,
    coverage: {
      editions: filtered.length,
      withWeather: events.length,
    },
    outdoor: {
      n: outdoor.length,
      avgSold: Math.round(outdoorAvg),
      buckets,
    },
    extremes,
    verdict: buildVerdict(outdoor, buckets),
  };
}
