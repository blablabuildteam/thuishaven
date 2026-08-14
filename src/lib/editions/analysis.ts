import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  emailCampaignMetrics,
  externalEvents,
  ticketInventory,
  weatherDaily,
} from "@/lib/db/schema";
import { parseEditionLineup } from "@/lib/editions/lineup";
import {
  scoreFestivalWeather,
  type FestivalWeatherScore,
} from "@/lib/weather/festival-score";
import { AMS } from "@/lib/weather/open-meteo";

export type EditionAnalysisRow = {
  id: string;
  name: string;
  day: string;
  startsAt: string;
  artists: string[];
  headliner: string | null;
  kind: string;
  isNachtshow: boolean;
  sold: number;
  capacity: number | null;
  /** Gewogen gem. ticketprijs (EUR) uit Weeztix tickettypes */
  avgPriceEur: number | null;
  sellThrough: number | null;
  weather: FestivalWeatherScore | null;
  campaigns: Array<{
    id: string;
    name: string;
    sent: number;
    opens: number;
    openRate: number | null;
  }>;
  competingFestivals: string[];
  /** Social volgt later (IG/Meta) */
  socialLinked: boolean;
};

export type ArtistStat = {
  artist: string;
  editions: number;
  totalSold: number;
  avgSold: number;
};

export type EditionLesson = {
  id: string;
  title: string;
  body: string;
  evidence: string;
};

export type EditionAnalysisBundle = {
  rows: EditionAnalysisRow[];
  artistLeaderboard: ArtistStat[];
  lessons: EditionLesson[];
  totals: {
    editions: number;
    withSales: number;
    totalSold: number;
    campaignsLinked: number;
    avgWeather: number | null;
  };
};

function overlapsDay(
  dayIso: string,
  start: Date,
  end: Date | null,
): boolean {
  const t = new Date(`${dayIso}T12:00:00`).getTime();
  const s = start.getTime();
  const e = end ? end.getTime() : s + 86400000;
  return t >= s && t <= e;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 8) return null;
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i]! - mx;
    const b = y[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export async function getEditionAnalysisBundle(options?: {
  limit?: number;
}): Promise<EditionAnalysisBundle> {
  const empty: EditionAnalysisBundle = {
    rows: [],
    artistLeaderboard: [],
    lessons: [],
    totals: {
      editions: 0,
      withSales: 0,
      totalSold: 0,
      campaignsLinked: 0,
      avgWeather: null,
    },
  };
  if (!hasDatabase()) return empty;

  const db = getDb();
  const limit = options?.limit ?? 120;

  const eds = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
      sold: ticketInventory.sold,
      capacity: ticketInventory.capacity,
      avgPriceEur: ticketInventory.avgPriceEur,
    })
    .from(editions)
    .leftJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
      ),
    )
    .where(isNotNull(editions.weeztixEventId))
    .orderBy(desc(editions.startsAt))
    .limit(limit);

  const filtered = eds.filter((e) => !/TEMPLATE/i.test(e.name));
  if (!filtered.length) return empty;

  const minDay = filtered[filtered.length - 1]!.startsAt;
  const maxDay = filtered[0]!.startsAt;

  const weatherRows = await db
    .select()
    .from(weatherDaily)
    .where(
      and(
        eq(weatherDaily.locationKey, AMS.locationKey),
        gte(weatherDaily.day, minDay),
        lte(weatherDaily.day, maxDay),
      ),
    );
  const weatherByDay = new Map(
    weatherRows.map((w) => [w.day.toISOString().slice(0, 10), w]),
  );

  const camps = await db
    .select()
    .from(emailCampaignMetrics)
    .where(isNotNull(emailCampaignMetrics.editionId));

  const campsByEdition = new Map<string, typeof camps>();
  for (const c of camps) {
    if (!c.editionId) continue;
    const list = campsByEdition.get(c.editionId) ?? [];
    list.push(c);
    campsByEdition.set(c.editionId, list);
  }

  const festivals = await db.select().from(externalEvents);

  const rows: EditionAnalysisRow[] = filtered.map((e) => {
    const day = e.startsAt.toISOString().slice(0, 10);
    const lineup = parseEditionLineup(e.name);
    const w = weatherByDay.get(day);
    const weather = w
      ? scoreFestivalWeather({
          day,
          tempMinC: w.tempMinC != null ? Number(w.tempMinC) : null,
          tempMaxC: w.tempMaxC != null ? Number(w.tempMaxC) : null,
          precipMm: w.precipMm != null ? Number(w.precipMm) : null,
          windMaxMps: w.windMaxMps != null ? Number(w.windMaxMps) : null,
          weatherCode: w.weatherCode,
        })
      : null;

    const linked = campsByEdition.get(e.id) ?? [];
    const competing = festivals
      .filter((f) => overlapsDay(day, f.startsAt, f.endsAt))
      .map((f) => f.name);

    const sold = e.sold ?? 0;
    const capacity = e.capacity;
    const avgPriceEur =
      e.avgPriceEur != null ? Number(e.avgPriceEur) : null;
    const sellThrough =
      capacity != null && capacity > 0 ? (sold / capacity) * 100 : null;

    return {
      id: e.id,
      name: e.name,
      day,
      startsAt: e.startsAt.toISOString(),
      artists: lineup.artists,
      headliner: lineup.headliner,
      kind: lineup.kind,
      isNachtshow: lineup.isNachtshow,
      sold,
      capacity,
      avgPriceEur:
        avgPriceEur != null && Number.isFinite(avgPriceEur)
          ? avgPriceEur
          : null,
      sellThrough,
      weather,
      campaigns: linked.map((c) => {
        const sent = c.sent ?? 0;
        const opens = c.opens ?? 0;
        return {
          id: c.id,
          name: c.name,
          sent,
          opens,
          openRate: sent > 0 ? (opens / sent) * 100 : null,
        };
      }),
      competingFestivals: competing,
      socialLinked: false,
    };
  });

  // Artist leaderboard (headliners weighted)
  const artistMap = new Map<string, { editions: number; totalSold: number }>();
  for (const r of rows) {
    if (r.sold <= 0) continue;
    const list = r.artists.length ? r.artists : [];
    for (const a of list.slice(0, 3)) {
      const cur = artistMap.get(a) ?? { editions: 0, totalSold: 0 };
      cur.editions += 1;
      cur.totalSold += r.sold;
      artistMap.set(a, cur);
    }
  }
  const artistLeaderboard: ArtistStat[] = [...artistMap.entries()]
    .map(([artist, v]) => ({
      artist,
      editions: v.editions,
      totalSold: v.totalSold,
      avgSold: Math.round(v.totalSold / Math.max(v.editions, 1)),
    }))
    .filter((a) => a.editions >= 2)
    .sort((a, b) => b.avgSold - a.avgSold)
    .slice(0, 12);

  const lessons = buildLessons(rows, artistLeaderboard);

  const withWeather = rows.filter((r) => r.weather);
  const avgWeather =
    withWeather.length > 0
      ? withWeather.reduce((s, r) => s + (r.weather?.score ?? 0), 0) /
        withWeather.length
      : null;

  return {
    rows,
    artistLeaderboard,
    lessons,
    totals: {
      editions: rows.length,
      withSales: rows.filter((r) => r.sold > 0).length,
      totalSold: rows.reduce((s, r) => s + r.sold, 0),
      campaignsLinked: camps.length,
      avgWeather,
    },
  };
}

function buildLessons(
  rows: EditionAnalysisRow[],
  artists: ArtistStat[],
): EditionLesson[] {
  const lessons: EditionLesson[] = [];
  const past = rows.filter(
    (r) => new Date(r.startsAt).getTime() < Date.now() && r.sold > 0,
  );

  if (artists[0]) {
    lessons.push({
      id: "top-artist",
      title: `${artists[0].artist} trekt relatief hard`,
      body: `Over ${artists[0].editions} edities gemiddeld ~${artists[0].avgSold.toLocaleString("nl-NL")} sold (som ${artists[0].totalSold.toLocaleString("nl-NL")}).`,
      evidence: "Line-up parse × Weeztix sold_count",
    });
  }

  // Weather correlation
  const scored = past.filter((r) => r.weather);
  const corr = pearson(
    scored.map((r) => r.weather!.score),
    scored.map((r) => r.sold),
  );
  if (corr != null) {
    lessons.push({
      id: "weather-corr",
      title:
        corr > 0.15
          ? "Beter festivalweer hangt samen met hogere sold"
          : corr < -0.15
            ? "Sold loopt niet synchroon met ‘mooi’ weer"
            : "Weer alleen verklaart sold nauwelijks",
      body:
        corr > 0.15
          ? `Correlatie weer-score ↔ sold ≈ ${corr.toFixed(2)} (positief). Natte/hete outliers blijven apart bekijken.`
          : corr < -0.15
            ? `Correlatie ≈ ${corr.toFixed(2)}. Sterke headliners of indoor-achtige edities kunnen weer overrulen.`
            : `Correlatie ≈ ${corr.toFixed(2)}. Line-up en timing wegen zwaarder dan de dagscore.`,
      evidence: `n=${scored.length} edities met weer + sold`,
    });
  }

  const withMail = past.filter((r) => r.campaigns.length > 0);
  const withoutMail = past.filter((r) => r.campaigns.length === 0);
  if (withMail.length >= 5 && withoutMail.length >= 5) {
    const avgWith =
      withMail.reduce((s, r) => s + r.sold, 0) / withMail.length;
    const avgWithout =
      withoutMail.reduce((s, r) => s + r.sold, 0) / withoutMail.length;
    const delta = ((avgWith - avgWithout) / Math.max(avgWithout, 1)) * 100;
    lessons.push({
      id: "mail-lift",
      title:
        delta > 8
          ? "Edities mét gekoppelde mail verkopen gemiddeld meer"
          : "Mail-koppeling laat nog geen duidelijk lift-patroon zien",
      body: `Gem. sold met mail ~${Math.round(avgWith).toLocaleString("nl-NL")} vs zonder ~${Math.round(avgWithout).toLocaleString("nl-NL")} (${delta > 0 ? "+" : ""}${Math.round(delta)}%). Let op: correlatie, geen harde causaliteit.`,
      evidence: `${withMail.length} met mail · ${withoutMail.length} zonder`,
    });
  }

  const ade = past.filter((r) => r.kind === "ade");
  const regular = past.filter((r) => r.kind === "regular" && !r.isNachtshow);
  if (ade.length >= 3 && regular.length >= 10) {
    const adeAvg = ade.reduce((s, r) => s + r.sold, 0) / ade.length;
    const regAvg = regular.reduce((s, r) => s + r.sold, 0) / regular.length;
    lessons.push({
      id: "ade",
      title: "ADE-dagen vs reguliere edities",
      body: `ADE gem. ~${Math.round(adeAvg).toLocaleString("nl-NL")} sold · regulier ~${Math.round(regAvg).toLocaleString("nl-NL")}. Gebruik ADE als aparte cohort in planning.`,
      evidence: `${ade.length} ADE · ${regular.length} regular`,
    });
  }

  const competing = past.filter((r) => r.competingFestivals.length > 0);
  if (competing.length >= 5) {
    const avgC =
      competing.reduce((s, r) => s + r.sold, 0) / competing.length;
    const rest = past.filter((r) => r.competingFestivals.length === 0);
    const avgR =
      rest.length > 0
        ? rest.reduce((s, r) => s + r.sold, 0) / rest.length
        : null;
    lessons.push({
      id: "competition",
      title: "Overlap met grote festivals",
      body:
        avgR != null
          ? `${competing.length} edities vielen samen met curated concurrenten (gem. sold ~${Math.round(avgC).toLocaleString("nl-NL")} vs ~${Math.round(avgR).toLocaleString("nl-NL")} zonder overlap).`
          : `${competing.length} edities met concurrentie-overlap — agenda verder verrijken voor scherpere claims.`,
      evidence: "external_events curated seed",
    });
  }

  // Outlier: strong sold on harsh weather
  const tough = past
    .filter((r) => (r.weather?.score ?? 10) <= 4 && r.sold >= 2000)
    .sort((a, b) => b.sold - a.sold)[0];
  if (tough) {
    lessons.push({
      id: "weather-proof",
      title: "Weer-proof editie",
      body: `${tough.headliner ?? tough.name} deed ${tough.sold.toLocaleString("nl-NL")} sold bij weer-score ${tough.weather?.score}/10 (${tough.weather?.label}). Line-up kan slecht weer overrulen.`,
      evidence: tough.day,
    });
  }

  return lessons.slice(0, 6);
}

/** Compact text block for LLM insights */
export function editionAnalysisToPrompt(
  bundle: EditionAnalysisBundle,
): string {
  const lines = [
    "=== Editie-analyse (tickets × lineup × weer × mail × concurrentie) ===",
    `Edities in view: ${bundle.totals.editions}`,
    `Met sales: ${bundle.totals.withSales}`,
    `Totaal sold: ${bundle.totals.totalSold}`,
    `Campagnes gekoppeld: ${bundle.totals.campaignsLinked}`,
    `Gem. festival-weer: ${bundle.totals.avgWeather?.toFixed(1) ?? "n/a"}`,
    "",
    "Lessen:",
    ...bundle.lessons.map(
      (l) => `- ${l.title}: ${l.body} [${l.evidence}]`,
    ),
    "",
    "Top artiesten (avg sold, ≥2 edities):",
    ...bundle.artistLeaderboard
      .slice(0, 8)
      .map(
        (a) =>
          `- ${a.artist}: avg ${a.avgSold} over ${a.editions} edities`,
      ),
  ];
  return lines.join("\n");
}
