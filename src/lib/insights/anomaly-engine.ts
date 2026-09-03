/**
 * Statistical anomaly engine for closed-row event insights.
 *
 * Compares each event against cohort baselines (format × day-type × season)
 * and emits Dutch explanatory sentences — not raw metric restatements.
 *
 * Deterministic and free. An LLM summarizer can wrap `detectAnomalies()`
 * later if templated copy feels too rigid (same cache cycle).
 *
 * Future dimensions (data not wired yet):
 * - paid media: ROAS / spend vs fill
 * - DJ fees: fee vs fill, headliner popularity vs velocity
 */

import type { EditionFormat } from "@/lib/editions/lineup";
import type { CompetitionLevel } from "@/lib/integrations/ra/genres";
import type { OrganicImpactLevel } from "@/lib/marketing/organic-impact";
import type { WeekdayKey } from "@/lib/time/nl-calendar";
import type { WeatherKind } from "@/lib/weather/classify";

const MIN_COHORT = 3;
const MAX_INSIGHTS = 3;
const SIGNIFICANCE_FLOOR = 0.28;

export type AnomalyDimension =
  | "fill"
  | "weather"
  | "competition"
  | "scan"
  | "social"
  | "email"
  | "pricing"
  | "soldout"
  | "same_day";

export type AnomalyInsight = {
  text: string;
  tone: "positive" | "neutral" | "caution" | "danger";
  dimension: AnomalyDimension;
  significance: number;
  detail?: string;
};

export type AnomalyEventInput = {
  editionId: string;
  day: string;
  format: EditionFormat;
  weekday: WeekdayKey;
  weekdayLabel: string;
  isOutdoor: boolean;
  status: "upcoming" | "past";
  tickets: {
    sold: number;
    capacity: number | null;
    fillPct: number | null;
    avgPriceEur: number | null;
    sameDaySold: number | null;
    soldOutDaysBefore: number | null;
    scanned: number;
    scanRatePct: number | null;
  };
  weather: {
    kind: WeatherKind;
    label: string;
  } | null;
  emailCampaigns: Array<{ ordersAfter: number | null }>;
  socialPosts: Array<{
    salesImpactRole: "promo" | "same_day" | "after";
    ticketLiftSold: number | null;
    reach: number;
    impressions: number;
  }>;
  competingFestivals: Array<{
    kind: "festival" | "holiday" | "party";
    name: string;
  }>;
  competitionLevel: CompetitionLevel | null;
  organicImpactLevel: OrganicImpactLevel | null;
};

type WeatherBand = "ideal" | "ok" | "poor";
type DayType = "weekend" | "weekday";
type Season = "outdoor" | "indoor";

type MetricStats = {
  n: number;
  median: number;
  p25: number;
  p75: number;
};

type CohortStats = {
  label: string;
  fill: MetricStats | null;
  scan: MetricStats | null;
  price: MetricStats | null;
  sameDayShare: MetricStats | null;
  soldOutDays: MetricStats | null;
};

export type AnomalyBaselines = {
  all: CohortStats;
  byKey: Map<string, CohortStats>;
  fillByCompetition: Record<CompetitionLevel, number | null>;
  fillByOrganic: Record<OrganicImpactLevel, number | null>;
  fillWithMail: number | null;
  fillWithoutMail: number | null;
  fillByWeatherOutdoor: Record<WeatherBand, number | null>;
  soldOutByYear: Map<
    number,
    { fastestDays: number; fastestId: string; secondDays: number | null }
  >;
};

const FORMAT_NL: Record<EditionFormat, string> = {
  hrs10: "10-uurs",
  regular: "reguliere",
  nacht: "nachtshow",
  ade: "ADE",
  paas: "Paas",
  hollandse_haven: "Hollandse Haven",
  opening: "opening",
  closing: "closing",
  other: "",
};

const WEEKDAY_NL: Record<WeekdayKey, string> = {
  vr: "vrijdag",
  za: "zaterdag",
  zo: "zondag",
  other: "doordeweeks",
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function metricStats(values: number[]): MetricStats | null {
  if (values.length === 0) return null;
  const med = median(values);
  const p25 = percentile(values, 0.25);
  const p75 = percentile(values, 0.75);
  if (med == null || p25 == null || p75 == null) return null;
  return { n: values.length, median: med, p25, p75 };
}

function dayTypeOf(weekday: WeekdayKey): DayType {
  return weekday === "other" ? "weekday" : "weekend";
}

function seasonOf(isOutdoor: boolean): Season {
  return isOutdoor ? "outdoor" : "indoor";
}

function weatherBand(kind: WeatherKind): WeatherBand {
  if (kind === "ideal") return "ideal";
  if (kind === "ok") return "ok";
  return "poor";
}

function isPoorWeather(kind: WeatherKind): boolean {
  return weatherBand(kind) === "poor";
}

function yearOf(day: string): number {
  return Number(day.slice(0, 4));
}

function sameDayShare(e: AnomalyEventInput): number | null {
  const sold = e.tickets.sold;
  const same = e.tickets.sameDaySold;
  if (sold <= 0 || same == null || same < 0) return null;
  return (same / sold) * 100;
}

function isSoldOut(e: AnomalyEventInput): boolean {
  const { fillPct, sold, capacity } = e.tickets;
  if (fillPct != null && fillPct >= 98) return true;
  return capacity != null && capacity > 0 && sold >= capacity;
}

function hasMail(e: AnomalyEventInput): boolean {
  return e.emailCampaigns.length > 0;
}

function promoPosts(e: AnomalyEventInput) {
  return e.socialPosts.filter(
    (p) => p.salesImpactRole === "promo" || p.salesImpactRole === "same_day",
  );
}

function cohortKeys(e: AnomalyEventInput): Array<{ key: string; label: string }> {
  const format = e.format;
  const day = dayTypeOf(e.weekday);
  const season = seasonOf(e.isOutdoor);
  const formatNl = FORMAT_NL[format];
  const weekdayNl = WEEKDAY_NL[e.weekday];
  const seasonNl = season === "outdoor" ? "outdoor" : "indoor";

  const specificLabel = [weekdayNl, seasonNl, formatNl || "events"]
    .filter(Boolean)
    .join(" ");
  const formatSeason = [formatNl, seasonNl].filter(Boolean).join(" ") || seasonNl;
  const daySeason =
    e.weekday === "other"
      ? `doordeweekse ${seasonNl}`
      : `${weekdayNl} ${seasonNl}`;

  return [
    {
      key: `fmt:${format}|day:${day}|season:${season}`,
      label: specificLabel,
    },
    {
      key: `fmt:${format}|season:${season}`,
      label: formatSeason,
    },
    {
      key: `day:${day}|season:${season}`,
      label: daySeason,
    },
    { key: `season:${season}`, label: `${seasonNl} events` },
    { key: "all", label: "alle events" },
  ];
}

function emptyCohort(label: string): CohortStats {
  return {
    label,
    fill: null,
    scan: null,
    price: null,
    sameDayShare: null,
    soldOutDays: null,
  };
}

function buildCohortStats(
  events: AnomalyEventInput[],
  label: string,
): CohortStats {
  const fill: number[] = [];
  const scan: number[] = [];
  const price: number[] = [];
  const sameDay: number[] = [];
  const soldOutDays: number[] = [];

  for (const e of events) {
    if (e.status !== "past") continue;
    if (e.tickets.fillPct != null && e.tickets.sold > 0) {
      fill.push(e.tickets.fillPct);
    }
    if (e.tickets.scanRatePct != null && e.tickets.scanned > 0) {
      scan.push(e.tickets.scanRatePct);
    }
    if (e.tickets.avgPriceEur != null && e.tickets.avgPriceEur > 0) {
      price.push(e.tickets.avgPriceEur);
    }
    const share = sameDayShare(e);
    if (share != null) sameDay.push(share);
    if (isSoldOut(e) && e.tickets.soldOutDaysBefore != null) {
      soldOutDays.push(e.tickets.soldOutDaysBefore);
    }
  }

  return {
    label,
    fill: metricStats(fill),
    scan: metricStats(scan),
    price: metricStats(price),
    sameDayShare: metricStats(sameDay),
    soldOutDays: metricStats(soldOutDays),
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function pastFill(e: AnomalyEventInput): number | null {
  if (e.status !== "past") return null;
  if (e.tickets.fillPct == null || e.tickets.sold <= 0) return null;
  return e.tickets.fillPct;
}

function sigFromPp(deltaPp: number, scale = 25): number {
  return Math.min(1, Math.abs(deltaPp) / scale);
}

function fmtPp(n: number): string {
  return `${Math.round(Math.abs(n))}`;
}

function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

function fmtEur(n: number): string {
  return `€${Math.round(n)}`;
}

function fmtCount(n: number): string {
  return n.toLocaleString("nl-NL");
}

/** Pick the tightest cohort that has enough past events for a metric. */
function resolveCohort(
  event: AnomalyEventInput,
  baselines: AnomalyBaselines,
  metric: keyof Omit<CohortStats, "label">,
): CohortStats | null {
  for (const { key, label } of cohortKeys(event)) {
    const cohort = key === "all" ? baselines.all : baselines.byKey.get(key);
    const stats = cohort?.[metric];
    if (stats && stats.n >= MIN_COHORT) {
      return cohort ?? { ...emptyCohort(label), [metric]: stats };
    }
  }
  const fallback = baselines.all[metric];
  if (fallback && fallback.n >= MIN_COHORT) return baselines.all;
  return null;
}

export function computeBaselines(
  events: AnomalyEventInput[],
): AnomalyBaselines {
  const byKey = new Map<string, { events: AnomalyEventInput[]; label: string }>();

  for (const e of events) {
    for (const { key, label } of cohortKeys(e)) {
      const bucket = byKey.get(key);
      if (bucket) {
        bucket.events.push(e);
      } else {
        byKey.set(key, { events: [e], label });
      }
    }
  }

  const statsByKey = new Map<string, CohortStats>();
  for (const [key, bucket] of byKey) {
    statsByKey.set(key, buildCohortStats(bucket.events, bucket.label));
  }

  const fillByCompetition: Record<CompetitionLevel, number | null> = {
    low: null,
    medium: null,
    high: null,
  };
  const fillByOrganic: Record<OrganicImpactLevel, number | null> = {
    low: null,
    medium: null,
    high: null,
  };
  const fillByWeatherOutdoor: Record<WeatherBand, number | null> = {
    ideal: null,
    ok: null,
    poor: null,
  };

  const competeBuckets: Record<CompetitionLevel, number[]> = {
    low: [],
    medium: [],
    high: [],
  };
  const organicBuckets: Record<OrganicImpactLevel, number[]> = {
    low: [],
    medium: [],
    high: [],
  };
  const weatherBuckets: Record<WeatherBand, number[]> = {
    ideal: [],
    ok: [],
    poor: [],
  };
  const withMail: number[] = [];
  const withoutMail: number[] = [];
  const soldOutByYear = new Map<string, { days: number; id: string; year: number }[]>();

  for (const e of events) {
    const fill = pastFill(e);
    if (fill != null) {
      if (e.competitionLevel) competeBuckets[e.competitionLevel].push(fill);
      if (e.organicImpactLevel) organicBuckets[e.organicImpactLevel].push(fill);
      if (hasMail(e)) withMail.push(fill);
      else withoutMail.push(fill);
      if (e.isOutdoor && e.weather) {
        weatherBuckets[weatherBand(e.weather.kind)].push(fill);
      }
    }
    if (
      e.status === "past" &&
      isSoldOut(e) &&
      e.tickets.soldOutDaysBefore != null &&
      e.tickets.soldOutDaysBefore >= 0
    ) {
      const year = yearOf(e.day);
      const list = soldOutByYear.get(String(year)) ?? [];
      list.push({
        days: e.tickets.soldOutDaysBefore,
        id: e.editionId,
        year,
      });
      soldOutByYear.set(String(year), list);
    }
  }

  for (const level of ["low", "medium", "high"] as const) {
    fillByCompetition[level] = mean(competeBuckets[level]);
    fillByOrganic[level] = mean(organicBuckets[level]);
  }
  for (const band of ["ideal", "ok", "poor"] as const) {
    fillByWeatherOutdoor[band] = mean(weatherBuckets[band]);
  }

  const yearFastest = new Map<
    number,
    { fastestDays: number; fastestId: string; secondDays: number | null }
  >();
  for (const [yearKey, list] of soldOutByYear) {
    list.sort((a, b) => b.days - a.days);
    const first = list[0];
    if (!first) continue;
    yearFastest.set(Number(yearKey), {
      fastestDays: first.days,
      fastestId: first.id,
      secondDays: list[1]?.days ?? null,
    });
  }

  return {
    all: statsByKey.get("all") ?? emptyCohort("alle events"),
    byKey: statsByKey,
    fillByCompetition,
    fillByOrganic,
    fillWithMail: mean(withMail),
    fillWithoutMail: mean(withoutMail),
    fillByWeatherOutdoor,
    soldOutByYear: yearFastest,
  };
}

function detectFill(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  const fill = e.tickets.fillPct;
  if (fill == null || e.tickets.sold <= 0) return null;

  const cohort = resolveCohort(e, baselines, "fill");
  if (!cohort?.fill) return null;

  const delta = fill - cohort.fill.median;
  const soldOut = isSoldOut(e);

  // Upcoming: only flag outperformance / sell-out, not "behind average".
  if (e.status === "upcoming" && !soldOut && delta <= 0) return null;

  const significance = soldOut
    ? Math.max(0.45, sigFromPp(delta, 22))
    : sigFromPp(delta, 22);
  if (significance < SIGNIFICANCE_FLOOR && !soldOut) return null;

  const above = delta > 0;
  const label = cohort.label;
  const tone: AnomalyInsight["tone"] = soldOut
    ? "positive"
    : above
      ? "positive"
      : fill < 50
        ? "caution"
        : "neutral";

  const text = soldOut
    ? above && Math.abs(delta) >= 6
      ? `Uitverkocht · ${fmtPp(delta)}pp boven ${label}`
      : `Uitverkocht · in lijn met ${label}`
    : above
      ? `${fmtPp(delta)}pp boven gem. voor ${label}`
      : `${fmtPp(delta)}pp onder gem. voor ${label}`;

  return {
    text,
    tone,
    dimension: "fill",
    significance: soldOut ? Math.min(1, significance + 0.1) : significance,
    detail: `Bezetting ${fmtPct(fill)} vs. mediaan ${fmtPct(cohort.fill.median)} voor ${label} (n=${cohort.fill.n}).`,
  };
}

function detectWeather(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  if (!e.isOutdoor || !e.weather) return null;
  const fill = e.tickets.fillPct;
  if (fill == null || e.tickets.sold <= 0) return null;
  if (e.status === "upcoming" && !isSoldOut(e)) return null;

  const band = weatherBand(e.weather.kind);
  const poorFill = baselines.fillByWeatherOutdoor.poor;
  const idealFill = baselines.fillByWeatherOutdoor.ideal;
  const soldOut = isSoldOut(e);

  if (isPoorWeather(e.weather.kind)) {
    const peer = poorFill ?? baselines.all.fill?.median ?? null;
    if (peer == null) return null;
    const resilient = soldOut || fill >= peer + 8;
    const hurt = !soldOut && fill <= peer - 6;
    if (!resilient && !hurt) return null;

    if (resilient) {
      const delta = fill - peer;
      return {
        text: soldOut
          ? `Uitverkocht ondanks ${e.weather.label.toLowerCase()}`
          : `${fmtPct(fill)} bezetting ondanks ${e.weather.label.toLowerCase()}`,
        tone: "positive",
        dimension: "weather",
        significance: Math.min(1, 0.55 + sigFromPp(delta, 30) * 0.4),
        detail: `Outdoor events met slecht weer gem. ${fmtPct(peer)} bezetting.`,
      };
    }

    return {
      text: `${e.weather.label} · ${fmtPp(peer - fill)}pp onder outdoor-regen`,
      tone: "caution",
      dimension: "weather",
      significance: sigFromPp(peer - fill, 20),
      detail: `Bezetting ${fmtPct(fill)} vs. ${fmtPct(peer)} bij vergelijkbaar weer.`,
    };
  }

  if (band === "ideal" && idealFill != null && !soldOut && fill <= idealFill - 10) {
    const delta = idealFill - fill;
    return {
      text: `Ideaal weer, toch ${fmtPp(delta)}pp onder outdoor-ideaal`,
      tone: "caution",
      dimension: "weather",
      significance: sigFromPp(delta, 22),
      detail: `Weer was geen rem: outdoor-ideaal gem. ${fmtPct(idealFill)}.`,
    };
  }

  return null;
}

function detectCompetition(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  const fill = e.tickets.fillPct;
  if (fill == null || e.tickets.sold <= 0) return null;
  if (!e.competitionLevel) return null;
  if (e.status === "upcoming" && !isSoldOut(e) && fill < 70) return null;

  const peer = baselines.fillByCompetition[e.competitionLevel];
  const highPeer = baselines.fillByCompetition.high;
  const lowPeer = baselines.fillByCompetition.low;
  const festivals = e.competingFestivals.filter((c) => c.kind === "festival");
  const soldOut = isSoldOut(e);

  if (e.competitionLevel === "high") {
    const expected = highPeer ?? peer;
    if (expected == null) return null;
    const beat = soldOut || fill >= expected + 8;
    const lost = !soldOut && fill <= expected - 8;
    if (!beat && !lost) return null;

    const nFest = festivals.length;
    const festBit = nFest > 0 ? `${nFest} festival${nFest === 1 ? "" : "s"}` : "drukke dag";

    if (beat) {
      return {
        text: `Hoge concurrentie (${festBit}) maar ${soldOut ? "uitverkocht" : fmtPct(fill)}`,
        tone: "positive",
        dimension: "competition",
        significance: Math.min(1, 0.62 + (soldOut ? 0.15 : 0)),
        detail: `Events met hoge concurrentie gem. ${fmtPct(expected)} bezetting.`,
      };
    }

    return {
      text: `Hoge concurrentie · ${fmtPp(expected - fill)}pp onder die nachten`,
      tone: "caution",
      dimension: "competition",
      significance: sigFromPp(expected - fill, 20),
      detail: `${festBit} dezelfde dag. Hoge-concurrentie nachten gem. ${fmtPct(expected)}.`,
    };
  }

  if (e.competitionLevel === "low" && lowPeer != null && !soldOut && fill <= lowPeer - 12) {
    return {
      text: `Lage concurrentie, toch ${fmtPp(lowPeer - fill)}pp onder rustige dagen`,
      tone: "caution",
      dimension: "competition",
      significance: sigFromPp(lowPeer - fill, 22),
      detail: "Weinig RA-concurrentie — uitblijvende verkoop heeft een andere oorzaak.",
    };
  }

  return null;
}

function detectScan(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  if (e.status !== "past") return null;
  const scan = e.tickets.scanRatePct;
  if (scan == null || e.tickets.scanned <= 0 || e.tickets.sold <= 0) return null;

  const cohort = resolveCohort(e, baselines, "scan");
  if (!cohort?.scan) return null;

  const delta = scan - cohort.scan.median;
  const significance = sigFromPp(delta, 18);
  if (significance < SIGNIFICANCE_FLOOR) return null;

  const weatherHint =
    e.isOutdoor && e.weather && isPoorWeather(e.weather.kind) && delta < 0
      ? `, mogelijk ${e.weather.label.toLowerCase()}`
      : "";

  return {
    text:
      delta < 0
        ? `${fmtPct(scan)} gescand · ${fmtPp(delta)}pp onder gem.${weatherHint}`
        : `${fmtPct(scan)} gescand · ${fmtPp(delta)}pp boven gem.`,
    tone: delta < 0 ? (scan < 55 ? "caution" : "neutral") : "positive",
    dimension: "scan",
    significance,
    detail: `Check-ins ${fmtCount(e.tickets.scanned)} / ${fmtCount(e.tickets.sold)}. Mediaan ${fmtPct(cohort.scan.median)} voor ${cohort.label}.`,
  };
}

function detectSocial(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  const fill = e.tickets.fillPct;
  const posts = promoPosts(e);
  const lift = posts.reduce((s, p) => s + (p.ticketLiftSold ?? 0), 0);
  const reach = posts.reduce((s, p) => s + Math.max(p.reach, p.impressions), 0);
  const level = e.organicImpactLevel;
  const highFill = baselines.fillByOrganic.high;
  const lowFill = baselines.fillByOrganic.low;

  if (level === "high" && posts.length > 0) {
    if (lift >= 40) {
      return {
        text: `Hoge organic · +${fmtCount(lift)} tickets in window`,
        tone: "positive",
        dimension: "social",
        significance: Math.min(1, 0.5 + Math.min(0.4, lift / 400)),
        detail: `${posts.length} promo/eventdag-posts, ${fmtCount(reach)} reach. Ticketlift = som in ±-windows (correlatie).`,
      };
    }
    if (fill != null && highFill != null && fill <= highFill - 12 && e.status === "past") {
      return {
        text: "Hoge organic, ticketverkoop bleef achter",
        tone: "caution",
        dimension: "social",
        significance: sigFromPp(highFill - fill, 22),
        detail: `Events met hoge organic gem. ${fmtPct(highFill)} bezetting vs. ${fmtPct(fill)} hier.`,
      };
    }
    if (posts.length >= 2) {
      return {
        text: `Hoge organic · ${posts.length} promo-posts`,
        tone: "positive",
        dimension: "social",
        significance: 0.4,
        detail: `${fmtCount(reach)} gecombineerd bereik. Geen meetbare ticketlift in de curve.`,
      };
    }
  }

  if (
    (level === "low" || level == null) &&
    posts.length === 0 &&
    fill != null &&
    e.status === "past" &&
    lowFill != null &&
    fill <= lowFill - 8
  ) {
    const withOrganic = baselines.fillByOrganic.medium ?? highFill;
    if (withOrganic == null) return null;
    const delta = withOrganic - fill;
    if (delta < 8) return null;
    return {
      text: `Geen organic push · events mét posts gem. ${fmtPct(withOrganic)}`,
      tone: "caution",
      dimension: "social",
      significance: sigFromPp(delta, 24),
      detail: "Geen promo/eventdag-posts gekoppeld. Aftermovies tellen niet mee.",
    };
  }

  return null;
}

function detectEmail(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  const fill = e.tickets.fillPct;
  const withMail = baselines.fillWithMail;
  const withoutMail = baselines.fillWithoutMail;
  const deltaMail =
    withMail != null && withoutMail != null ? withMail - withoutMail : null;
  const orders = e.emailCampaigns.reduce((s, m) => s + (m.ordersAfter ?? 0), 0);

  if (!hasMail(e)) {
    if (e.status !== "past" || fill == null || withMail == null) return null;
    if (deltaMail == null || deltaMail < 6) return null;
    if (fill >= withMail - 4) return null;
    return {
      text: `Geen mail · events mét mail gem. ${fmtPp(deltaMail)}pp hoger`,
      tone: "caution",
      dimension: "email",
      significance: sigFromPp(deltaMail, 20),
      detail: `Bezetting ${fmtPct(fill)} vs. ${fmtPct(withMail)} bij events met Brevo-campagne.`,
    };
  }

  if (orders >= 25 && (isSoldOut(e) || (fill != null && fill >= 80))) {
    return {
      text: `${e.emailCampaigns.length} mail · ~${fmtCount(orders)} orders erna`,
      tone: "positive",
      dimension: "email",
      significance: Math.min(1, 0.42 + Math.min(0.35, orders / 200)),
      detail: "Orders in de week ná verzending (correlatie, geen harde attributie).",
    };
  }

  if (
    e.status === "past" &&
    fill != null &&
    withMail != null &&
    orders < 8 &&
    fill <= withMail - 10
  ) {
    return {
      text: "Mail gekoppeld, nauwelijks orders erna",
      tone: "neutral",
      dimension: "email",
      significance: sigFromPp(withMail - fill, 24),
      detail: `${e.emailCampaigns.length} campagne(s), ~${fmtCount(orders)} tickets in de week erna.`,
    };
  }

  return null;
}

function detectPricing(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  const price = e.tickets.avgPriceEur;
  const fill = e.tickets.fillPct;
  if (price == null || price <= 0 || fill == null || e.tickets.sold <= 0) {
    return null;
  }

  const cohort = resolveCohort(e, baselines, "price");
  if (!cohort?.price) return null;

  const rel = ((price - cohort.price.median) / cohort.price.median) * 100;
  if (Math.abs(rel) < 12) return null;

  const cheaper = rel < 0;
  const soldOut = isSoldOut(e);
  const significance = Math.min(1, Math.abs(rel) / 35);

  if (cheaper && !soldOut && e.status === "past" && fill < 85) {
    return {
      text: `${fmtEur(price)} · ${fmtPp(rel)}% onder normaal, niet uitverkocht`,
      tone: "caution",
      dimension: "pricing",
      significance: Math.max(significance, 0.4),
      detail: `Prijs was geen rem (mediaan ${fmtEur(cohort.price.median)} voor ${cohort.label}).`,
    };
  }

  if (!cheaper && soldOut) {
    return {
      text: `Uitverkocht bij ${fmtEur(price)} · ${fmtPp(rel)}% boven gem.`,
      tone: "positive",
      dimension: "pricing",
      significance: Math.max(significance, 0.48),
      detail: `Vraag hield ${fmtPp(rel)}% hogere prijs vol vs. ${cohort.label}.`,
    };
  }

  if (!cheaper && e.status === "past" && fill <= 70) {
    return {
      text: `${fmtEur(price)} · ${fmtPp(rel)}% duurder, ${fmtPct(fill)} bezetting`,
      tone: "caution",
      dimension: "pricing",
      significance: significance,
      detail: `Mediaanprijs ${fmtEur(cohort.price.median)} voor ${cohort.label}.`,
    };
  }

  if (cheaper && soldOut) {
    return {
      text: `Uitverkocht · prijs ${fmtPp(rel)}% onder ${cohort.label}`,
      tone: "neutral",
      dimension: "pricing",
      significance: significance * 0.85,
      detail: `Gem. ${fmtEur(price)} vs. mediaan ${fmtEur(cohort.price.median)}.`,
    };
  }

  return null;
}

function detectSoldout(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  if (!isSoldOut(e)) {
    if (e.status !== "past" || e.tickets.fillPct == null) return null;
    const cohort = resolveCohort(e, baselines, "soldOutDays");
    if (!cohort?.soldOutDays || cohort.soldOutDays.n < MIN_COHORT) return null;
    if (e.tickets.fillPct >= 90) return null;
    // Similar events often sell out, this one didn't — only if most peers did.
    if (cohort.soldOutDays.median < 1) return null;
    return {
      text: `Niet uitverkocht · peers gem. ${Math.round(cohort.soldOutDays.median)}d eerder vol`,
      tone: "caution",
      dimension: "soldout",
      significance: 0.42,
      detail: `Vergelijkbare ${cohort.label} die wél uitverkochten, mediaan ${Math.round(cohort.soldOutDays.median)} dagen vóór start.`,
    };
  }

  const days = e.tickets.soldOutDaysBefore;
  if (days == null) return null;

  const year = yearOf(e.day);
  const yearRank = baselines.soldOutByYear.get(year);
  if (yearRank && yearRank.fastestId === e.editionId && days > 0) {
    const second = yearRank.secondDays;
    return {
      text:
        second != null
          ? `Snelst uitverkocht ${year} (${days}d vóór)`
          : `Snelst uitverkocht ${year} (${days}d vóór)`,
      tone: "positive",
      dimension: "soldout",
      significance: 0.92,
      detail:
        second != null
          ? `Tweede was ${second}d vóór start.`
          : "Enige uitverkochte editie met timing dit jaar.",
    };
  }

  const cohort = resolveCohort(e, baselines, "soldOutDays");
  if (!cohort?.soldOutDays || days <= 0) {
    if (days === 0) {
      return {
        text: "Uitverkocht op de eventdag",
        tone: "neutral",
        dimension: "soldout",
        significance: 0.38,
        detail: "Vol geraakt op de dag zelf — laat in de curve.",
      };
    }
    return null;
  }

  const delta = days - cohort.soldOutDays.median;
  if (Math.abs(delta) < 3) return null;

  return {
    text:
      delta > 0
        ? `Uitverkocht ${days}d vóór · ${Math.round(delta)}d sneller dan ${cohort.label}`
        : `Laat uitverkocht (${days}d vóór) vs. ${cohort.label}`,
    tone: delta > 0 ? "positive" : "neutral",
    dimension: "soldout",
    significance: Math.min(1, 0.35 + Math.abs(delta) / 20),
    detail: `Mediaan ${Math.round(cohort.soldOutDays.median)}d vóór voor uitverkochte ${cohort.label}.`,
  };
}

function detectSameDay(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  if (e.status !== "past") return null;
  const share = sameDayShare(e);
  if (share == null) return null;

  const cohort = resolveCohort(e, baselines, "sameDayShare");
  if (!cohort?.sameDayShare) return null;

  const delta = share - cohort.sameDayShare.median;
  const significance = sigFromPp(delta, 16);
  if (significance < SIGNIFICANCE_FLOOR) return null;

  return {
    text:
      delta > 0
        ? `${fmtPct(share)} dag-verkoop · ${fmtPp(delta)}pp boven gem.`
        : `${fmtPct(share)} dag-verkoop · vooral presale`,
    tone: delta > 0 ? "neutral" : "positive",
    dimension: "same_day",
    significance,
    detail: `Mediaan ${fmtPct(cohort.sameDayShare.median)} same-day aandeel voor ${cohort.label}.`,
  };
}

const DETECTORS: Array<
  (e: AnomalyEventInput, b: AnomalyBaselines) => AnomalyInsight | null
> = [
  detectFill,
  detectWeather,
  detectCompetition,
  detectScan,
  detectSocial,
  detectEmail,
  detectPricing,
  detectSoldout,
  detectSameDay,
];

/**
 * Ranked anomaly insights for one event. Caps at 3, drops weak signals.
 * At most one insight per dimension.
 */
export function detectAnomalies(
  event: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight[] {
  const found: AnomalyInsight[] = [];
  for (const detect of DETECTORS) {
    const hit = detect(event, baselines);
    if (hit && hit.significance >= SIGNIFICANCE_FLOOR) {
      found.push(hit);
    }
  }

  found.sort((a, b) => b.significance - a.significance);
  return found.slice(0, MAX_INSIGHTS);
}

/** Apply baselines + detection across a list (mutates `insights` via callback). */
export function annotateAnomalies<T extends AnomalyEventInput>(
  events: T[],
): AnomalyInsight[][] {
  const baselines = computeBaselines(events);
  return events.map((e) => detectAnomalies(e, baselines));
}
