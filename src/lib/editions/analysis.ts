import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  emailCampaignMetrics,
  externalEvents,
  ticketInventory,
  ticketSalesDaily,
  weatherDaily,
} from "@/lib/db/schema";
import {
  parseEditionLineup,
  editionFormat,
  type EditionFormat,
} from "@/lib/editions/lineup";
import {
  scoreFestivalWeather,
  type FestivalWeatherScore,
} from "@/lib/weather/festival-score";
import {
  classifyEventWeather,
  type ClassifiedWeather,
} from "@/lib/weather/classify";
import { weatherLocationMatch } from "@/lib/weather/store";
import {
  amsterdamDay,
  isOutdoorSeason,
  shiftIsoDay,
} from "@/lib/time/amsterdam";
import { normalizeWeeztixInventory } from "@/lib/integrations/weeztix/inventory";
import {
  estimateSoldOutTiming,
  type SoldOutTiming,
} from "@/lib/editions/sold-out-timing";
import {
  periodsForDay,
  weekdayKeyFromIso,
  yearFromIso,
  isUsableArtistName,
  type CalendarPeriod,
  type WeekdayKey,
} from "@/lib/time/nl-calendar";

export type EditionAnalysisRow = {
  id: string;
  name: string;
  day: string;
  startsAt: string;
  artists: string[];
  headliner: string | null;
  kind: string;
  format: EditionFormat;
  weekday: WeekdayKey;
  year: number;
  periods: CalendarPeriod[];
  isNachtshow: boolean;
  sold: number;
  capacity: number | null;
  /** Gewogen gem. ticketprijs (EUR) uit Weeztix tickettypes */
  avgPriceEur: number | null;
  sellThrough: number | null;
  /** Orders in de 7 dagen tot en met eventdag (waar curve bestaat) */
  lastWeekSold: number | null;
  /** Als inventory uitverkocht is: dagen vóór start (uit verkopen-curve). */
  soldOutTiming: SoldOutTiming | null;
  weather: FestivalWeatherScore | null;
  weatherClass: ClassifiedWeather | null;
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
  /** actionable | insight | caution */
  kind?: "action" | "insight" | "caution";
};

export type EditionAnalysisBundle = {
  rows: EditionAnalysisRow[];
  artistLeaderboard: ArtistStat[];
  lessons: EditionLesson[];
  recommendations: EditionLesson[];
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
    recommendations: [],
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
      available: ticketInventory.available,
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
        weatherLocationMatch(),
        gte(weatherDaily.day, minDay),
        lte(weatherDaily.day, maxDay),
      ),
    );
  const weatherByDay = new Map(
    weatherRows.map((w) => [amsterdamDay(w.day), w]),
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
    const day =
      typeof r.day === "string"
        ? r.day.slice(0, 10)
        : amsterdamDay(r.day);
    list.push({ day, sold: r.sold });
    dailyByEdition.set(r.editionId, list);
  }

  const rows: EditionAnalysisRow[] = filtered.map((e) => {
    const day = amsterdamDay(e.startsAt);
    const lineup = parseEditionLineup(e.name);
    const format = editionFormat(e.name, lineup.kind, lineup.isNachtshow);
    const w = weatherByDay.get(day);
    const wxInput = w
      ? {
          day,
          tempMinC: w.tempMinC != null ? Number(w.tempMinC) : null,
          tempMaxC: w.tempMaxC != null ? Number(w.tempMaxC) : null,
          precipMm: w.precipMm != null ? Number(w.precipMm) : null,
          windMaxMps: w.windMaxMps != null ? Number(w.windMaxMps) : null,
          weatherCode: w.weatherCode,
        }
      : null;
    const weather = wxInput ? scoreFestivalWeather(wxInput) : null;
    const weatherClass = wxInput ? classifyEventWeather(wxInput) : null;

    const linked = campsByEdition.get(e.id) ?? [];
    const competing = festivals
      .filter((f) => overlapsDay(day, f.startsAt, f.endsAt))
      .map((f) => f.name);

    const inv = normalizeWeeztixInventory({
      sold: e.sold,
      capacity: e.capacity,
      available: e.available,
    });
    const sold = inv.sold;
    const capacity = inv.capacity;
    const avgPriceEur =
      e.avgPriceEur != null ? Number(e.avgPriceEur) : null;
    const sellThrough =
      capacity != null && capacity > 0 ? (sold / capacity) * 100 : null;

    const windowStart = shiftIsoDay(day, -6);
    const curve = dailyByEdition.get(e.id) ?? [];
    const lastWeek = curve
      .filter((p) => p.day >= windowStart && p.day <= day)
      .reduce((s, p) => s + p.sold, 0);

    const soldOutTiming = estimateSoldOutTiming({
      eventDay: day,
      sold,
      capacity,
      daily: curve,
    });

    const artists = lineup.artists.filter(isUsableArtistName);

    return {
      id: e.id,
      name: e.name,
      day,
      startsAt: e.startsAt.toISOString(),
      artists,
      headliner: artists[0] ?? lineup.headliner,
      kind: lineup.kind,
      format,
      weekday: weekdayKeyFromIso(day),
      year: yearFromIso(day),
      periods: periodsForDay(day),
      isNachtshow: lineup.isNachtshow,
      sold,
      capacity,
      avgPriceEur:
        avgPriceEur != null && Number.isFinite(avgPriceEur)
          ? avgPriceEur
          : null,
      sellThrough,
      lastWeekSold: lastWeek > 0 ? lastWeek : null,
      soldOutTiming,
      weather,
      weatherClass,
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

  const { lessons, recommendations } = buildLessons(rows, artistLeaderboard);

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
    recommendations,
    totals: {
      editions: rows.length,
      withSales: rows.filter((r) => r.sold > 0).length,
      totalSold: rows.reduce((s, r) => s + r.sold, 0),
      campaignsLinked: camps.length,
      avgWeather,
    },
  };
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildLessons(
  rows: EditionAnalysisRow[],
  artists: ArtistStat[],
): { lessons: EditionLesson[]; recommendations: EditionLesson[] } {
  const lessons: EditionLesson[] = [];
  const recommendations: EditionLesson[] = [];
  const past = rows.filter(
    (r) => new Date(r.startsAt).getTime() < Date.now() && r.sold > 0,
  );

  const hrs10 = past.filter((r) => /10\s*h/i.test(r.name));
  const regular = past.filter(
    (r) => r.kind === "regular" && !r.isNachtshow && !/10\s*h/i.test(r.name),
  );
  const nacht = past.filter(
    (r) => r.isNachtshow || r.kind === "nachtshow",
  );
  const ade = past.filter((r) => r.kind === "ade");
  const summer = past.filter((r) => {
    const m = new Date(r.startsAt).getUTCMonth() + 1;
    return m >= 5 && m <= 9;
  });
  const winter = past.filter((r) => {
    const m = new Date(r.startsAt).getUTCMonth() + 1;
    return m <= 4 || m >= 10;
  });

  const a10 = avg(hrs10.map((r) => r.sold));
  const aReg = avg(regular.map((r) => r.sold));
  if (a10 != null && aReg != null && hrs10.length >= 15 && regular.length >= 30) {
    const lift = ((a10 - aReg) / aReg) * 100;
    lessons.push({
      id: "10hrs",
      kind: "insight",
      title: "10HRS-formats verkopen structureel harder",
      body: `10HRS gem. ~${Math.round(a10).toLocaleString("nl-NL")} sold vs overige regular ~${Math.round(aReg).toLocaleString("nl-NL")} (${lift > 0 ? "+" : ""}${Math.round(lift)}%).`,
      evidence: `n=${hrs10.length} 10HRS · n=${regular.length} overig regular`,
    });
    if (lift >= 10) {
      recommendations.push({
        id: "rec-10hrs",
        kind: "action",
        title: "Bescherm en herhaal 10HRS-slots",
        body: "Houd top-DJ’s op 10HRS i.p.v. kortere slots als omzet/volume het doel is. Test A/B alleen op mid-tier namen.",
        evidence: "Format-cohort op historische sold",
      });
    }
  }

  const aNacht = avg(nacht.map((r) => r.sold));
  const fNacht = avg(
    nacht
      .map((r) => r.sellThrough)
      .filter((x): x is number => x != null),
  );
  const fReg = avg(
    regular
      .map((r) => r.sellThrough)
      .filter((x): x is number => x != null),
  );
  if (aNacht != null && aReg != null && nacht.length >= 5) {
    lessons.push({
      id: "nachtshow",
      kind: "caution",
      title: "Nachtshows blijven achter op volume én fill",
      body: `Nachtshow gem. ~${Math.round(aNacht).toLocaleString("nl-NL")} sold (fill ~${fNacht != null ? `${Math.round(fNacht)}%` : "n/a"}) vs regular ~${Math.round(aReg).toLocaleString("nl-NL")} (fill ~${fReg != null ? `${Math.round(fReg)}%` : "n/a"}).`,
      evidence: `n=${nacht.length} nachtshows`,
    });
    recommendations.push({
      id: "rec-nacht",
      kind: "action",
      title: "Nachtshow = aparte P&L, geen default upsell",
      body: "Alleen plannen als marge/atmosfeer het doel is, of koppelen aan een uitverkochte day-show. Niet als standaard tweede stack op zwakke dagen.",
      evidence: "Lagere sold + lagere fill historisch",
    });
  }

  const aSum = avg(summer.map((r) => r.sold));
  const aWin = avg(winter.map((r) => r.sold));
  if (aSum != null && aWin != null && summer.length >= 40 && winter.length >= 40) {
    const lift = ((aSum - aWin) / aWin) * 100;
    lessons.push({
      id: "season",
      kind: "insight",
      title: "Mei–september draait hardere volumes",
      body: `Zomerseizoen gem. ~${Math.round(aSum).toLocaleString("nl-NL")} sold vs okt–apr ~${Math.round(aWin).toLocaleString("nl-NL")} (${lift > 0 ? "+" : ""}${Math.round(lift)}%).`,
      evidence: `n=${summer.length} zomer · n=${winter.length} winter`,
    });
    recommendations.push({
      id: "rec-season",
      kind: "action",
      title: "Zet A-lijst headliners in mei–sept",
      body: "Reserveer zwakkere winterslots voor community/mid-tier; A-namen en 10HRS bij voorkeur in outdoor-seizoen.",
      evidence: "Seizoenscohort",
    });
  }

  if (ade.length >= 5 && aReg != null) {
    const aAde = avg(ade.map((r) => r.sold));
    const fAde = avg(
      ade.map((r) => r.sellThrough).filter((x): x is number => x != null),
    );
    lessons.push({
      id: "ade",
      kind: "insight",
      title: "ADE vult beter dan een gemiddelde regular",
      body: `ADE gem. ~${Math.round(aAde ?? 0).toLocaleString("nl-NL")} sold · fill ~${fAde != null ? `${Math.round(fAde)}%` : "n/a"} (regular fill ~${fReg != null ? `${Math.round(fReg)}%` : "n/a"}). Apart cohort houden in reporting.`,
      evidence: `n=${ade.length} ADE-dagen`,
    });
  }

  const outdoorWx = past.filter(
    (r) =>
      r.weatherClass &&
      isOutdoorSeason(r.day) &&
      Number(r.day.slice(0, 4)) >= 2025,
  );
  const harshWx = outdoorWx.filter(
    (r) =>
      r.weatherClass!.kind === "cold_wet" ||
      r.weatherClass!.kind === "wet" ||
      r.weatherClass!.kind === "heat" ||
      r.weatherClass!.kind === "cold",
  );
  const comfortWx = outdoorWx.filter(
    (r) =>
      r.weatherClass!.kind === "ideal" || r.weatherClass!.kind === "ok",
  );
  const aHarsh = avg(harshWx.map((r) => r.sold));
  const aComfort = avg(comfortWx.map((r) => r.sold));
  if (
    aHarsh != null &&
    aComfort != null &&
    harshWx.length >= 3 &&
    comfortWx.length >= 5
  ) {
    const lift = ((aHarsh - aComfort) / aComfort) * 100;
    lessons.push({
      id: "weather",
      kind: "caution",
      title:
        lift < -8
          ? "Koud/nat of te heet: lagere volumes vanaf 2025"
          : "Weer op de eventdag is nu zichtbaar — effect op totaal is modest",
      body:
        lift < -8
          ? `Op outdoor-dagen vanaf 2025 verkopen koud-natte / regen- / hitte-edities gem. ~${Math.round(aHarsh).toLocaleString("nl-NL")} vs ~${Math.round(aComfort).toLocaleString("nl-NL")} op droge, comfortabele dagen (${Math.round(lift)}%). Totaalverkoop loopt weken; weer raakt vooral de dag zelf.`
          : `Comfortabele dagen gem. ~${Math.round(aComfort).toLocaleString("nl-NL")} sold, slecht weer ~${Math.round(aHarsh).toLocaleString("nl-NL")}. Line-up blijft zwaarder; check de Weer-pagina voor de echte dagen.`,
      evidence: `n=${harshWx.length} slecht · n=${comfortWx.length} comfort · mei–sept 2025+`,
    });
  } else {
    const scored = past.filter((r) => r.weather);
    const corr = pearson(
      scored.map((r) => r.weather!.score),
      scored.map((r) => r.sold),
    );
    if (corr != null) {
      lessons.push({
        id: "weather",
        kind: "insight",
        title: "Weer meenemen als dagconditie, niet als 1–10 score",
        body: "Kijk naar °C en mm regen op de eventdag (vanaf 2025). Een koude regendag of hitte verandert sfeer en last-minute, niet altijd de hele voorverkoop.",
        evidence: `n=${scored.length} met weerdata`,
      });
    }
  }

  const strongArtists = artists.filter((a) => a.editions >= 3).slice(0, 5);
  if (strongArtists[0]) {
    lessons.push({
      id: "artists",
      kind: "insight",
      title: `Herhaalde top: ${strongArtists
        .slice(0, 3)
        .map((a) => a.artist)
        .join(", ")}`,
      body: `${strongArtists[0].artist} avg ~${strongArtists[0].avgSold.toLocaleString("nl-NL")} sold over ${strongArtists[0].editions} edities. Booking-beslissingen kunnen op deze herhaal-metrics.`,
      evidence: "Artiesten met ≥3 edities in view",
    });
    recommendations.push({
      id: "rec-artists",
      kind: "action",
      title: "Bouw een ‘proven draw’-lijst",
      body: `Prioriteer herboekingen van namen met ≥3 edities en bovengemiddelde sold (nu o.a. ${strongArtists
        .slice(0, 4)
        .map((a) => a.artist)
        .join(", ")}). Nieuwe namen: kleinere capacity of support-slot.`,
      evidence: "Artist leaderboard",
    });
  }

  recommendations.push({
    id: "rec-data",
    kind: "action",
    title: "Volgende data voor scherpere claims",
    body: "1) Dagelijkse verkoopcurve (Weeztix) rond mail/post. 2) Instagram/Meta posts gekoppeld op datum. 3) Netto ticketprijs zonder free/import barcodes. 4) Exacte concurrent-agenda. Zonder #1 blijft attributie zacht.",
    evidence: "Huidige gaten in event-model",
  });

  recommendations.push({
    id: "rec-mail",
    kind: "caution",
    title: "Mail-lift nog niet hard te claimen",
    body: "Gekoppelde mails zitten vooral op recentere edities (betere capacity-data). Claim geen causaliteit tot je sold-per-dag rond send hebt.",
    evidence: "Selection bias mail-cohort",
  });

  return {
    lessons: lessons.slice(0, 6),
    recommendations: recommendations.slice(0, 6),
  };
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
    "Recommendations:",
    ...bundle.recommendations.map(
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
