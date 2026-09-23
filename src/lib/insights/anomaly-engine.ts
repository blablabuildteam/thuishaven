/**
 * Statistical anomaly engine for closed-row event insights.
 *
 * Compares each event against cohort baselines (format × day-type × season)
 * and emits Dutch explanatory sentences — not raw metric restatements.
 *
 * The primary chip is a combined story: ticket sales against weather,
 * same-day competition, organic posts, paid purchases, and DJ-fees.
 * It only fires on a divergence (outcome vs conditions, ads vs posts,
 * or sales pace vs the usual curve). Single-topic chips stay for signals
 * the story does not already cover.
 *
 * Deterministic and free. An LLM summarizer can wrap `detectAnomalies()`
 * later if templated copy feels too rigid (same cache cycle).
 */

import type { EditionFormat } from "@/lib/editions/lineup";
import {
  djFeeSpendMidpoint,
  formatDjFeeSpend,
  type DjFeeSpend,
} from "@/lib/dashboard/dj-fee-ranges";
import {
  IMPACT_LEVELS,
  isHighImpact,
  isLowImpact,
  type ImpactLevel,
} from "@/lib/insights/impact-scale";
import type { CompetitionLevel } from "@/lib/integrations/ra/genres";
import type { OrganicImpactLevel } from "@/lib/marketing/organic-impact";
import type { WeekdayKey } from "@/lib/time/nl-calendar";
import type { WeatherKind } from "@/lib/weather/classify";

const MIN_COHORT = 3;
const MAX_INSIGHTS = 5;
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
  | "same_day"
  | "dj_fees"
  | "paid"
  | "investment"
  | "story";

export type AnomalyFact = {
  label: string;
  value: string;
};

export type AnomalyInsight = {
  text: string;
  tone: "positive" | "neutral" | "caution" | "danger";
  dimension: AnomalyDimension;
  significance: number;
  detail?: string;
  /** Comparison metrics for the detail modal — not shown on the chip. */
  facts?: AnomalyFact[];
  /** Present on weather insights so the chip can match heat / rain / wind. */
  weatherKind?: WeatherKind;
  /** Story already explains sell-out timing or last-minute share. */
  coversTiming?: boolean;
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
    /** Daily sold counts. Missing days are zero. Used for pace vs peers. */
    salesByDay?: Array<{ day: string; sold: number }>;
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
  djFeeInvestmentLevel?: 1 | 2 | 3 | 4 | 5 | null;
  paidInvestmentLevel?: 1 | 2 | 3 | 4 | 5 | null;
  /** Combined DJ-fee midpoint + ad spend vs other events. */
  investmentLevel?: 1 | 2 | 3 | 4 | 5 | null;
  djFees?: {
    spend: DjFeeSpend;
  } | null;
  paid?: {
    spendCents: number;
    ads: number;
    impressions: number;
    clicks: number;
    roas: number | null;
    /** Platform-reported purchases (Meta pixel / TikTok complete payment). */
    purchases?: number;
  } | null;
  /** 1–5 purchase volume vs other events. Optional; story uses the raw count. */
  paidSalesLevel?: ImpactLevel | null;
  paidAds?: Array<{
    dateStart: string | null;
    publishedAt: string | null;
    spendCents: number;
    purchases: number;
  }>;
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
  fee: MetricStats | null;
  sameDayShare: MetricStats | null;
  soldOutDays: MetricStats | null;
  /** Share of final tickets already sold 21 days before the event. */
  pace21: MetricStats | null;
  /** Share of final tickets already sold 7 days before the event. */
  pace7: MetricStats | null;
  /** Ticket revenue / ad spend, only events with linked spend. */
  roas: MetricStats | null;
  /** Tickets in the week after a linked mail. Events with a campaign, including quiet ones. */
  mailOrders: MetricStats | null;
  /** Tickets around promo posts. Events with those posts, including no lift. */
  postLift: MetricStats | null;
};

export type AnomalyBaselines = {
  all: CohortStats;
  byKey: Map<string, CohortStats>;
  fillByCompetition: Record<CompetitionLevel, number | null>;
  fillByOrganic: Record<OrganicImpactLevel, number | null>;
  fillByDjFee: Record<ImpactLevel, number | null>;
  fillByPaid: Record<ImpactLevel, number | null>;
  fillByInvestment: Record<ImpactLevel, number | null>;
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

function shiftIso(day: string, delta: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Percent of eventual tickets sold by `daysBefore` the event. Null if the curve starts later. */
function paceShare(e: AnomalyEventInput, daysBefore: number): number | null {
  const series = e.tickets.salesByDay;
  if (!series?.length || e.tickets.sold <= 0 || e.status !== "past") return null;
  const cutoff = shiftIso(e.day, -daysBefore);
  let first: string | null = null;
  let cum = 0;
  for (const point of series) {
    const day = point.day.slice(0, 10);
    if (!day) continue;
    if (!first || day < first) first = day;
    if (day <= cutoff) cum += point.sold;
  }
  if (!first || first > cutoff) return null;
  return Math.min(100, (cum / e.tickets.sold) * 100);
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
    fee: null,
    sameDayShare: null,
    soldOutDays: null,
    pace21: null,
    pace7: null,
    roas: null,
    mailOrders: null,
    postLift: null,
  };
}

function buildCohortStats(
  events: AnomalyEventInput[],
  label: string,
): CohortStats {
  const fill: number[] = [];
  const scan: number[] = [];
  const price: number[] = [];
  const fee: number[] = [];
  const sameDay: number[] = [];
  const soldOutDays: number[] = [];
  const pace21: number[] = [];
  const pace7: number[] = [];
  const roas: number[] = [];
  const mailOrders: number[] = [];
  const postLift: number[] = [];

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
    const feeMid = e.djFees?.spend
      ? djFeeSpendMidpoint(e.djFees.spend)
      : null;
    if (feeMid != null) fee.push(feeMid);
    const share = sameDayShare(e);
    if (share != null) sameDay.push(share);
    if (isSoldOut(e) && e.tickets.soldOutDaysBefore != null) {
      soldOutDays.push(e.tickets.soldOutDaysBefore);
    }
    const p21 = paceShare(e, 21);
    const p7 = paceShare(e, 7);
    if (p21 != null) pace21.push(p21);
    if (p7 != null) pace7.push(p7);
    if (e.paid?.roas != null && e.paid.roas > 0 && paidSpendCents(e) >= 5000) {
      roas.push(e.paid.roas);
    }
    if (hasMail(e)) {
      mailOrders.push(
        e.emailCampaigns.reduce((sum, mail) => sum + (mail.ordersAfter ?? 0), 0),
      );
    }
    if (promoPosts(e).length > 0) postLift.push(organicLiftSold(e));
  }

  return {
    label,
    fill: metricStats(fill),
    scan: metricStats(scan),
    price: metricStats(price),
    fee: metricStats(fee),
    sameDayShare: metricStats(sameDay),
    soldOutDays: metricStats(soldOutDays),
    pace21: metricStats(pace21),
    pace7: metricStats(pace7),
    roas: metricStats(roas),
    mailOrders: metricStats(mailOrders),
    postLift: metricStats(postLift),
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

function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

function weatherCause(kind: WeatherKind): string {
  if (kind === "wet") return "de regen";
  if (kind === "cold_wet") return "kou en regen";
  if (kind === "cold") return "de kou";
  if (kind === "heat") return "de hitte";
  if (kind === "windy") return "de wind";
  return "het weer";
}

function fmtEur(n: number): string {
  return `€${Math.round(n).toLocaleString("nl-NL")}`;
}

function fmtCount(n: number): string {
  return n.toLocaleString("nl-NL");
}

function paidSpendCents(e: AnomalyEventInput): number {
  return e.paid?.spendCents ?? 0;
}

function fmtRoas(n: number): string {
  return `${n.toFixed(1)}×`;
}

function roasPeer(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): { label: string; median: number } | null {
  const cohort = resolveCohort(e, baselines, "roas");
  if (!cohort?.roas || cohort.roas.n < MIN_COHORT) return null;
  return { label: cohort.label, median: cohort.roas.median };
}

function paidSpendLabel(e: AnomalyEventInput): string | null {
  const cents = paidSpendCents(e);
  if (cents <= 0) return null;
  return fmtEur(cents / 100);
}

function djFeeLabel(e: AnomalyEventInput): string | null {
  const spend = e.djFees?.spend;
  if (!spend || spend.priced < 1) return null;
  return formatDjFeeSpend(spend);
}

function peerFill(
  buckets: Record<ImpactLevel, number | null>,
  levels: ImpactLevel[],
): number | null {
  return mean(levels.flatMap((l) => {
    const v = buckets[l];
    return v == null ? [] : [v];
  }));
}

/** Prefer high-spend peers; fall back to all events if that bucket is too small. */
function fillToBeat(
  peer: number | null,
  typical: number | null,
  fill: number,
): number | null {
  if (peer != null && peer >= fill + 12) return peer;
  if (typical != null && typical >= fill + 12) return typical;
  return null;
}

function facts(
  ...rows: Array<[string, string | number | null | undefined]>
): AnomalyFact[] {
  const out: AnomalyFact[] = [];
  for (const [label, value] of rows) {
    if (value == null || value === "") continue;
    out.push({
      label,
      value: typeof value === "number" ? String(value) : value,
    });
  }
  return out;
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

  const fillByCompetition = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, null]),
  ) as Record<CompetitionLevel, number | null>;
  const fillByOrganic = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, null]),
  ) as Record<OrganicImpactLevel, number | null>;
  const fillByDjFee = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, null]),
  ) as Record<ImpactLevel, number | null>;
  const fillByPaid = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, null]),
  ) as Record<ImpactLevel, number | null>;
  const fillByInvestment = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, null]),
  ) as Record<ImpactLevel, number | null>;
  const fillByWeatherOutdoor: Record<WeatherBand, number | null> = {
    ideal: null,
    ok: null,
    poor: null,
  };

  const competeBuckets = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, [] as number[]]),
  ) as Record<CompetitionLevel, number[]>;
  const organicBuckets = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, [] as number[]]),
  ) as Record<OrganicImpactLevel, number[]>;
  const djFeeBuckets = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, [] as number[]]),
  ) as Record<ImpactLevel, number[]>;
  const paidBuckets = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, [] as number[]]),
  ) as Record<ImpactLevel, number[]>;
  const investmentBuckets = Object.fromEntries(
    IMPACT_LEVELS.map((level) => [level, [] as number[]]),
  ) as Record<ImpactLevel, number[]>;
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
      if (e.djFeeInvestmentLevel) djFeeBuckets[e.djFeeInvestmentLevel].push(fill);
      if (e.paidInvestmentLevel) paidBuckets[e.paidInvestmentLevel].push(fill);
      if (e.investmentLevel) investmentBuckets[e.investmentLevel].push(fill);
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

  for (const level of IMPACT_LEVELS) {
    fillByCompetition[level] = mean(competeBuckets[level]);
    fillByOrganic[level] = mean(organicBuckets[level]);
    fillByDjFee[level] = mean(djFeeBuckets[level]);
    fillByPaid[level] = mean(paidBuckets[level]);
    fillByInvestment[level] = mean(investmentBuckets[level]);
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
    fillByDjFee,
    fillByPaid,
    fillByInvestment,
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

  const usual = fmtPct(cohort.fill.median);
  const text = soldOut
    ? above && Math.abs(delta) >= 6
      ? `Uitverkocht (${fmtPct(fill)}) — meer dan vergelijkbare ${label} (meestal ${usual})`
      : `Uitverkocht (${fmtPct(fill)}) — in lijn met vergelijkbare ${label} (meestal ${usual})`
    : above
      ? `${fmtPct(fill)} verkocht — meer dan vergelijkbare ${label} (meestal ${usual})`
      : `${fmtPct(fill)} verkocht — minder dan vergelijkbare ${label} (meestal ${usual})`;

  return {
    text,
    tone,
    dimension: "fill",
    significance: soldOut ? Math.min(1, significance + 0.1) : significance,
    detail: [
      soldOut
        ? above && Math.abs(delta) >= 6
          ? `${fmtPct(fill)} van de kaarten verkocht, uitverkocht. Vergelijkbare ${label} verkopen meestal ${usual}.`
          : `${fmtPct(fill)} van de kaarten verkocht, uitverkocht. Dat ligt in lijn met vergelijkbare ${label} (meestal ${usual}).`
        : `${fmtPct(fill)} van de kaarten verkocht. Vergelijkbare ${label} verkopen meestal ${usual}.`,
      salesContextWhy(e),
    ]
      .filter(Boolean)
      .join(" "),
    facts: facts(
      ["Verkocht", `${fmtPct(fill)} van de capaciteit`],
      ["Vergelijkbare " + label, usual],
      ["Verkocht", fmtCount(e.tickets.sold)],
      ["Capaciteit", e.tickets.capacity != null ? fmtCount(e.tickets.capacity) : null],
      ["DJ-fees", djFeeLabel(e)],
      ["Ad spend", paidSpendLabel(e)],
      [
        "Ticket-ROAS",
        e.paid?.roas != null ? `${e.paid.roas.toFixed(1)}×` : null,
      ],
    ),
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
        weatherKind: e.weather.kind,
        significance: Math.min(1, 0.55 + sigFromPp(delta, 30) * 0.4),
        detail: soldOut
          ? `Uitverkocht (${fmtPct(fill)}) terwijl het ${e.weather.label.toLowerCase()} was. Outdoor events met slecht weer zitten meestal maar rond ${fmtPct(peer)} vol.`
          : `Dit event was ${fmtPct(fill)} vol ondanks ${e.weather.label.toLowerCase()}. Outdoor events met slecht weer zitten meestal rond ${fmtPct(peer)} vol.`,
        facts: facts(
          ["Dit event", fmtPct(fill)],
          ["Outdoor bij slecht weer", fmtPct(peer)],
          ["Weer", e.weather.label],
        ),
      };
    }

    return {
      text: `${e.weather.label} — minder vol dan gebruikelijk bij slecht weer`,
      tone: "caution",
      dimension: "weather",
      weatherKind: e.weather.kind,
      significance: sigFromPp(peer - fill, 20),
      detail: `Het was ${e.weather.label.toLowerCase()} en dit event raakte ${fmtPct(fill)} vol. Bij vergelijkbaar slecht weer zitten outdoor events meestal rond ${fmtPct(peer)} vol.`,
      facts: facts(
        ["Dit event", fmtPct(fill)],
        ["Outdoor bij slecht weer", fmtPct(peer)],
        ["Weer", e.weather.label],
      ),
    };
  }

  if (band === "ideal" && idealFill != null && !soldOut && fill <= idealFill - 10) {
    const delta = idealFill - fill;
    return {
      text: "Ideaal weer, toch minder vol dan andere mooie dagen",
      tone: "caution",
      dimension: "weather",
      weatherKind: e.weather.kind,
      significance: sigFromPp(delta, 22),
      detail: `Het weer was ideaal, dus dat was geen rem. Dit event was ${fmtPct(fill)} vol; andere mooie outdoor-dagen zitten meestal rond ${fmtPct(idealFill)} vol.`,
      facts: facts(
        ["Dit event", fmtPct(fill)],
        ["Mooie outdoor-dagen", fmtPct(idealFill)],
        ["Weer", e.weather.label],
      ),
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
  const highPeer = mean(
    ([4, 5] as ImpactLevel[]).flatMap((l) => {
      const v = baselines.fillByCompetition[l];
      return v == null ? [] : [v];
    }),
  );
  const lowPeer = mean(
    ([1, 2] as ImpactLevel[]).flatMap((l) => {
      const v = baselines.fillByCompetition[l];
      return v == null ? [] : [v];
    }),
  );
  const festivals = e.competingFestivals.filter((c) => c.kind === "festival");
  const soldOut = isSoldOut(e);

  if (isHighImpact(e.competitionLevel)) {
    const expected = highPeer ?? peer;
    if (expected == null) return null;
    const beat = soldOut || fill >= expected + 8;
    const lost = !soldOut && fill <= expected - 8;
    if (!beat && !lost) return null;

    const nFest = festivals.length;
    const festBit = nFest > 0 ? `${nFest} festival${nFest === 1 ? "" : "s"}` : "drukke dag";
    const competeLabel =
      e.competitionLevel === 5 ? "Zeer hoge concurrentie" : "Hoge concurrentie";

    if (beat) {
      return {
        text: `${competeLabel} (${festBit}) maar ${soldOut ? "uitverkocht" : `${fmtPct(fill)} verkocht`}`,
        tone: "positive",
        dimension: "competition",
        significance: Math.min(1, 0.62 + (soldOut ? 0.15 : 0)),
        detail: soldOut
          ? `Uitverkocht (${fmtPct(fill)}) terwijl er ${festBit} naast speelde. Op zulke drukke avonden raken events meestal rond ${fmtPct(expected)} vol.`
          : `Dit event was ${fmtPct(fill)} vol terwijl er ${festBit} naast speelde. Op zulke drukke avonden zitten events meestal rond ${fmtPct(expected)} vol.`,
        facts: facts(
          ["Verkocht", `${fmtPct(fill)} van de capaciteit`],
          ["Drukke avonden", `${fmtPct(expected)} vol`],
          ["Festivals dezelfde dag", nFest > 0 ? String(nFest) : "0"],
          ["Parties / feestdagen", String(e.competingFestivals.length - nFest)],
        ),
      };
    }

    return {
      text: `${competeLabel} — minder vol dan andere drukke avonden`,
      tone: "caution",
      dimension: "competition",
      significance: sigFromPp(expected - fill, 20),
      detail: `Er speelde ${festBit} op dezelfde dag. Dit event was ${fmtPct(fill)} vol; andere drukke avonden zitten meestal rond ${fmtPct(expected)} vol.`,
      facts: facts(
        ["Dit event", fmtPct(fill)],
        ["Drukke avonden", fmtPct(expected)],
        ["Festivals dezelfde dag", nFest > 0 ? String(nFest) : "0"],
      ),
    };
  }

  if (isLowImpact(e.competitionLevel) && lowPeer != null && !soldOut && fill <= lowPeer - 12) {
    return {
      text: "Weinig concurrentie, toch minder vol dan rustige avonden",
      tone: "caution",
      dimension: "competition",
      significance: sigFromPp(lowPeer - fill, 22),
      detail: `Er speelde weinig mee in de stad, dus concurrentie was geen rem. Dit event was ${fmtPct(fill)} vol; rustige avonden zitten meestal rond ${fmtPct(lowPeer)} vol.`,
      facts: facts(
        ["Dit event", fmtPct(fill)],
        ["Rustige avonden", fmtPct(lowPeer)],
        ["Andere events die dag", String(e.competingFestivals.length)],
      ),
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

  const cause =
    e.isOutdoor && e.weather && isPoorWeather(e.weather.kind) && delta < 0
      ? weatherCause(e.weather.kind)
      : null;
  const compared = `${fmtPct(scan)} gescand, meestal ${fmtPct(cohort.scan.median)}`;

  return {
    text:
      delta < 0
        ? `Minder bezoekers binnen (${compared})${cause ? ` — mogelijk door ${cause}` : ""}`
        : `Meer bezoekers binnen dan gebruikelijk (${compared})`,
    tone: delta < 0 ? (scan < 55 ? "caution" : "neutral") : "positive",
    dimension: "scan",
    weatherKind: cause && e.weather ? e.weather.kind : undefined,
    significance,
    detail:
      delta < 0
        ? `${fmtPct(scan)} van de verkochte kaarten is gescand (${fmtCount(e.tickets.scanned)} van ${fmtCount(e.tickets.sold)}). Bij vergelijkbare ${cohort.label} is dat meestal ${fmtPct(cohort.scan.median)}.${
            cause ? ` ${cause.charAt(0).toUpperCase()}${cause.slice(1)} kan verklaren dat er minder binnenkwam.` : ""
          }`
        : `${fmtPct(scan)} van de verkochte kaarten is gescand (${fmtCount(e.tickets.scanned)} van ${fmtCount(e.tickets.sold)}). Bij vergelijkbare ${cohort.label} is dat meestal ${fmtPct(cohort.scan.median)}.`,
    facts: facts(
      ["Gescand", `${fmtPct(scan)} (${fmtCount(e.tickets.scanned)} van ${fmtCount(e.tickets.sold)})`],
      ["Vergelijkbare " + cohort.label, fmtPct(cohort.scan.median)],
      ["Niet binnengekomen", fmtCount(Math.max(0, e.tickets.sold - e.tickets.scanned))],
    ),
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
  const highFill = mean(
    ([4, 5] as ImpactLevel[]).flatMap((l) => {
      const v = baselines.fillByOrganic[l];
      return v == null ? [] : [v];
    }),
  );
  const lowFill = mean(
    ([1, 2] as ImpactLevel[]).flatMap((l) => {
      const v = baselines.fillByOrganic[l];
      return v == null ? [] : [v];
    }),
  );

  if (level != null && isHighImpact(level) && posts.length > 0) {
    const organicLabel =
      level === 5 ? "Sterke social push" : "Duidelijke social push";
    if (lift >= 40) {
      const liftPeer = resolveCohort(e, baselines, "postLift");
      const usualLift = liftPeer?.postLift;
      const above =
        usualLift != null &&
        usualLift.n >= MIN_COHORT &&
        lift >= usualLift.median * 1.5 &&
        lift >= usualLift.median + 30;
      if (above && usualLift && liftPeer) {
      const usual = fmtCount(Math.round(usualLift.median));
      return {
        text: `${organicLabel} — +${fmtCount(lift)} tickets rond posts, meestal +${usual}`,
        tone: "positive",
        dimension: "social",
        significance: Math.min(1, 0.5 + Math.min(0.4, (lift - usualLift.median) / 400)),
        detail: `${posts.length} posts vóór of op de eventdag bereikten ${fmtCount(reach)} mensen. In de dagen rond die posts gingen er ${fmtCount(lift)} extra tickets weg. Bij vergelijkbare ${liftPeer.label} met posts is dat meestal +${usual}. Dat is een samenhang, geen harde toewijzing.`,
        facts: facts(
          ["Promo / eventdag-posts", String(posts.length)],
          ["Bereik", fmtCount(reach)],
          ["Tickets rond die posts", "+" + fmtCount(lift)],
          ["Meestal rond posts", "+" + usual],
          ["Bezetting", fill != null ? fmtPct(fill) : null],
        ),
      };
      }
    }
    if (fill != null && highFill != null && fill <= highFill - 12 && e.status === "past") {
      return {
        text: `${organicLabel}, maar ${fmtPct(fill)} verkocht (vergelijkbare push meestal ${fmtPct(highFill)})`,
        tone: "caution",
        dimension: "social",
        significance: sigFromPp(highFill - fill, 22),
        detail: `Er was een duidelijke social push, maar dit event was ${fmtPct(fill)} vol. Events met een vergelijkbare push zitten meestal rond ${fmtPct(highFill)} vol.`,
        facts: facts(
          ["Dit event", fmtPct(fill)],
          ["Events met sterke social", fmtPct(highFill)],
          ["Promo-posts", String(posts.length)],
          ["Bereik", fmtCount(reach)],
        ),
      };
    }
  }

  if (
    (level == null || isLowImpact(level)) &&
    posts.length === 0 &&
    fill != null &&
    e.status === "past" &&
    lowFill != null &&
    fill <= lowFill - 8
  ) {
    const withOrganic =
      baselines.fillByOrganic[3] ??
      baselines.fillByOrganic[4] ??
      highFill;
    if (withOrganic == null) return null;
    const delta = withOrganic - fill;
    if (delta < 8) return null;
    return {
      text: "Geen social vooraf — events mét posts verkopen beter",
      tone: "caution",
      dimension: "social",
      significance: sigFromPp(delta, 24),
      detail: `Er zijn geen promo-posts vóór het event gekoppeld (aftermovies tellen niet mee). Dit event was ${fmtPct(fill)} vol; events mét posts zitten meestal rond ${fmtPct(withOrganic)} vol.`,
      facts: facts(
        ["Dit event", fmtPct(fill)],
        ["Events mét posts", fmtPct(withOrganic)],
        ["Promo-posts", "0"],
      ),
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
  const mailWindowMeasured = e.emailCampaigns.every(
    (m) => m.ordersAfter != null,
  );

  if (!hasMail(e)) {
    if (e.status !== "past" || fill == null || withMail == null) return null;
    if (deltaMail == null || deltaMail < 6) return null;
    if (fill >= withMail - 4) return null;
    return {
      text: "Geen mail verstuurd — events mét mail verkopen beter",
      tone: "caution",
      dimension: "email",
      significance: sigFromPp(deltaMail, 20),
      detail: `Er is geen mailcampagne gekoppeld. Dit event was ${fmtPct(fill)} vol; events mét mail zitten meestal rond ${fmtPct(withMail)} vol.`,
      facts: facts(
        ["Dit event", fmtPct(fill)],
        ["Events mét mail", fmtPct(withMail)],
        ["Events zonder mail", withoutMail != null ? fmtPct(withoutMail) : null],
      ),
    };
  }

  if (!mailWindowMeasured) return null;

  const mailPeer = resolveCohort(e, baselines, "mailOrders");
  const usualOrders = mailPeer?.mailOrders;
  const usualOrdersLabel =
    usualOrders && usualOrders.n >= MIN_COHORT
      ? fmtCount(Math.round(usualOrders.median))
      : null;

  if (orders >= 25 && (isSoldOut(e) || (fill != null && fill >= 80))) {
    if (usualOrdersLabel == null || usualOrders == null || mailPeer == null) return null;
    const high =
      orders >= usualOrders.median * 1.5 && orders >= usualOrders.median + 50;
    if (!high) return null;
    const mailWord = e.emailCampaigns.length === 1 ? "mail" : "mails";
    return {
      text: `${e.emailCampaigns.length} ${mailWord} · ~${fmtCount(orders)} orders erna, meestal ~${usualOrdersLabel}`,
      tone: "positive",
      dimension: "email",
      significance: Math.min(
        1,
        0.5 + Math.min(0.35, (orders - usualOrders.median) / 800),
      ),
      detail: `${e.emailCampaigns.length === 1 ? "Na de mail" : "Na de mails"} gingen er ongeveer ${fmtCount(orders)} tickets weg in de 24 uur erna${fill != null ? ` (${fmtPct(fill)} verkocht)` : ""}. Bij vergelijkbare ${mailPeer.label} met een mail is dat meestal ongeveer ${usualOrdersLabel}. Dat is een samenhang, geen harde toewijzing.`,
      facts: facts(
        ["Campagnes", String(e.emailCampaigns.length)],
        ["Tickets in de 24 uur erna", "~" + fmtCount(orders)],
        ["Meestal na een mail", "~" + usualOrdersLabel],
        ["Verkocht", fill != null ? fmtPct(fill) : null],
      ),
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
      text: usualOrdersLabel
        ? `Mail gekoppeld, ~${fmtCount(orders)} orders erna — meestal ~${usualOrdersLabel}`
        : "Mail gekoppeld, nauwelijks orders erna",
      tone: "neutral",
      dimension: "email",
      significance: sigFromPp(withMail - fill, 24),
      detail: `Er ${e.emailCampaigns.length === 1 ? "is een mailcampagne" : `zijn ${e.emailCampaigns.length} mailcampagnes`} gekoppeld, maar in de 24 uur erna gingen er maar ongeveer ${fmtCount(orders)} tickets weg${usualOrdersLabel ? `. Bij vergelijkbare ${mailPeer?.label ?? "events"} met een mail is dat meestal ongeveer ${usualOrdersLabel}` : ""}. ${fmtPct(fill)} verkocht; events mét mail zitten meestal rond ${fmtPct(withMail)}.`,
      facts: facts(
        ["Campagnes", String(e.emailCampaigns.length)],
        ["Tickets in de 24 uur erna", "~" + fmtCount(orders)],
        ["Meestal na een mail", usualOrdersLabel ? "~" + usualOrdersLabel : null],
        ["Verkocht", fmtPct(fill)],
        ["Events mét mail", fmtPct(withMail)],
      ),
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
      text: `${fmtEur(price)} per kaart — goedkoper dan gebruikelijk, toch niet vol`,
      tone: "caution",
      dimension: "pricing",
      significance: Math.max(significance, 0.4),
      detail: `De gemiddelde kaartprijs was ${fmtEur(price)}, lager dan de ${fmtEur(cohort.price.median)} bij vergelijkbare ${cohort.label}. Toch was dit event maar ${fmtPct(fill)} vol — de prijs was dus geen rem.`,
      facts: facts(
        ["Prijs dit event", fmtEur(price)],
        ["Vergelijkbare " + cohort.label, fmtEur(cohort.price.median)],
        ["Bezetting", fmtPct(fill)],
      ),
    };
  }

  if (!cheaper && soldOut) {
    return {
      text: `Uitverkocht bij ${fmtEur(price)} — duurder dan gebruikelijk`,
      tone: "positive",
      dimension: "pricing",
      significance: Math.max(significance, 0.48),
      detail: `Uitverkocht bij ${fmtEur(price)} per kaart. Vergelijkbare ${cohort.label} liggen rond ${fmtEur(cohort.price.median)} — de vraag hield de hogere prijs dus vol.`,
      facts: facts(
        ["Prijs dit event", fmtEur(price)],
        ["Vergelijkbare " + cohort.label, fmtEur(cohort.price.median)],
        ["Bezetting", fmtPct(fill)],
      ),
    };
  }

  if (!cheaper && e.status === "past" && fill <= 70) {
    return {
      text: `${fmtEur(price)} per kaart — duurder, en niet vol`,
      tone: "caution",
      dimension: "pricing",
      significance: significance,
      detail: `De gemiddelde kaartprijs was ${fmtEur(price)}, hoger dan de ${fmtEur(cohort.price.median)} bij vergelijkbare ${cohort.label}. Dit event raakte ${fmtPct(fill)} vol.`,
      facts: facts(
        ["Prijs dit event", fmtEur(price)],
        ["Vergelijkbare " + cohort.label, fmtEur(cohort.price.median)],
        ["Bezetting", fmtPct(fill)],
      ),
    };
  }

  if (cheaper && soldOut) {
    return {
      text: `Uitverkocht — kaarten goedkoper dan bij vergelijkbare ${cohort.label}`,
      tone: "neutral",
      dimension: "pricing",
      significance: significance * 0.85,
      detail: `Uitverkocht bij ${fmtEur(price)} per kaart. Vergelijkbare ${cohort.label} liggen rond ${fmtEur(cohort.price.median)}.`,
      facts: facts(
        ["Prijs dit event", fmtEur(price)],
        ["Vergelijkbare " + cohort.label, fmtEur(cohort.price.median)],
        ["Bezetting", fmtPct(fill)],
      ),
    };
  }

  return null;
}

function detectDjFees(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  if (e.status !== "past") return null;
  const spend = e.djFees?.spend;
  if (!spend || spend.priced < 1) return null;
  const fill = e.tickets.fillPct;
  if (fill == null || e.tickets.sold <= 0) return null;
  const level = e.djFeeInvestmentLevel ?? null;
  const spendLabel = formatDjFeeSpend(spend);
  const soldOut = isSoldOut(e);
  const highFill = peerFill(baselines.fillByDjFee, [4, 5]);
  const lowFill = peerFill(baselines.fillByDjFee, [1, 2]);

  if (level != null && isHighImpact(level)) {
    const investLabel =
      level === 5 ? "Zeer hoge DJ-fee investering" : "Hoge DJ-fee investering";
    if (soldOut || fill >= 92) {
      return {
        text: `${investLabel} — toch vol`,
        tone: "positive",
        dimension: "dj_fees",
        significance: 0.5,
        detail: `${investLabel.toLowerCase()} t.o.v. andere events (${spendLabel}, ${spend.priced} DJ${spend.priced === 1 ? "" : "s"} met range). Dit event was ${fmtPct(fill)} vol — de duurdere line-up werd dus gedragen. Fees zijn bandbreedtes, geen exacte bedragen.`,
        facts: facts(
          ["Investering", `${level}/5`],
          ["DJ-fees", spendLabel],
          ["Ad spend", paidSpendLabel(e)],
          ["Bezetting", fmtPct(fill)],
        ),
      };
    }
    if (highFill != null && fill <= highFill - 12) {
      return {
        text: `${investLabel}, maar de verkoop bleef achter`,
        tone: "caution",
        dimension: "dj_fees",
        significance: sigFromPp(highFill - fill, 22),
        detail: `${investLabel.toLowerCase()} t.o.v. andere events (${spendLabel}). Dit event was ${fmtPct(fill)} vol; events met een vergelijkbare DJ-fee investering zitten meestal rond ${fmtPct(highFill)} vol. Fees zijn bandbreedtes, geen exacte bedragen.`,
        facts: facts(
          ["Investering", `${level}/5`],
          ["Dit event", fmtPct(fill)],
          ["Events met hoge DJ-fees", fmtPct(highFill)],
          ["DJ-fees", spendLabel],
          ["Ad spend", paidSpendLabel(e)],
        ),
      };
    }
  }

  if (level != null && isLowImpact(level) && (soldOut || fill >= 92)) {
    return {
      text: "Lage DJ-fee investering — toch vol",
      tone: "positive",
      dimension: "dj_fees",
      significance: 0.46,
      detail: `Lage DJ-fee investering t.o.v. andere events (${spendLabel}). Dit event was ${fmtPct(fill)} vol${lowFill != null ? `; events met een lage investering zitten meestal rond ${fmtPct(lowFill)} vol` : ""}. Fees zijn bandbreedtes, geen exacte bedragen.`,
      facts: facts(
        ["Investering", `${level}/5`],
        ["DJ-fees", spendLabel],
        ["Ad spend", paidSpendLabel(e)],
        ["Bezetting", fmtPct(fill)],
        ["Events met lage DJ-fees", lowFill != null ? fmtPct(lowFill) : null],
      ),
    };
  }

  const mid = djFeeSpendMidpoint(spend);
  const cohort = resolveCohort(e, baselines, "fee");
  if (mid == null || !cohort?.fee) return null;
  const rel = ((mid - cohort.fee.median) / Math.max(1, cohort.fee.median)) * 100;
  if (Math.abs(rel) < 22) return null;
  const expensive = rel > 0;
  const significance = Math.min(1, Math.abs(rel) / 55);

  if (expensive && fill <= 72) {
    return {
      text: `DJ-fees hoger dan gebruikelijk, event ${fmtPct(fill)} vol`,
      tone: "caution",
      dimension: "dj_fees",
      significance: Math.max(significance, 0.4),
      detail: `De DJ-fee bandbreedte was ${spendLabel} (midden ±${fmtEur(mid)}). Vergelijkbare ${cohort.label} zitten rond ${fmtEur(cohort.fee.median)}. Toch was dit event maar ${fmtPct(fill)} vol. Fees zijn bandbreedtes, geen exacte bedragen.`,
      facts: facts(
        ["DJ-fees dit event", spendLabel],
        ["Vergelijkbare " + cohort.label, fmtEur(cohort.fee.median)],
        ["Bezetting", fmtPct(fill)],
      ),
    };
  }

  return null;
}

/** Why a ticket-ROAS stands out: what the ads reported, and what else was going on. */
function paidRoasWhy(e: AnomalyEventInput, fill: number): string {
  const purchases = e.paid?.purchases ?? 0;
  const sold = e.tickets.sold;
  const share =
    sold > 0 && purchases > 0 ? Math.min(100, (purchases / sold) * 100) : 0;
  const lift = organicLiftSold(e);
  const posts = promoPosts(e).length;
  const lines: string[] = [];

  if (purchases > 0 && share >= 18) {
    lines.push(
      `De ads telden ${fmtCount(purchases)} aankopen, ongeveer ${fmtPct(share)} van de verkochte kaarten.`,
    );
  } else {
    lines.push(
      `De ads telden ${purchases > 0 ? `maar ${fmtCount(purchases)} aankopen` : "geen aankopen"}${sold > 0 ? ` op ${fmtCount(sold)} verkochte kaarten` : ""}. De ROAS deelt de hele ticketomzet door de spend, niet alleen de aankopen die de platforms aan de ads geven.`,
    );
  }

  if (lift >= 20 && posts > 0) {
    lines.push(
      `Rond ${posts === 1 ? "de promo-post" : `${posts} promo-posts`} gingen er +${fmtCount(lift)} tickets weg.`,
    );
  }

  const soldOut = isSoldOut(e) || fill >= 98;
  const days = e.tickets.soldOutDaysBefore;
  if (soldOut && days != null && days >= 2) {
    lines.push(`De kaarten waren ${days} dagen vóór de eventdag al op.`);
  } else if (soldOut) {
    lines.push("Het event raakte uitverkocht, dus de ticketomzet in die deling is hoog.");
  }

  const around: string[] = [];
  if (e.isOutdoor && e.weather && isPoorWeather(e.weather.kind)) {
    around.push(weatherCause(e.weather.kind));
  } else if (e.isOutdoor && e.weather?.kind === "ideal") {
    around.push("mooi weer");
  }
  if (e.competitionLevel != null && isHighImpact(e.competitionLevel)) {
    const festivals = e.competingFestivals.filter((c) => c.kind === "festival").length;
    around.push(
      festivals > 0
        ? `${festivals} festival${festivals === 1 ? "" : "s"} dezelfde dag`
        : "een drukke stad",
    );
  } else if (e.competitionLevel != null && isLowImpact(e.competitionLevel)) {
    around.push("weinig concurrentie");
  }
  if (e.djFeeInvestmentLevel != null && isHighImpact(e.djFeeInvestmentLevel)) {
    around.push("hoge DJ-fees");
  } else if (e.djFeeInvestmentLevel != null && isLowImpact(e.djFeeInvestmentLevel)) {
    around.push("lage DJ-fees");
  }
  if (around.length > 0) lines.push(`Daarnaast: ${listNl(around)}.`);

  return lines.join(" ");
}

/** Other signals worth naming next to a sales gap. Null unless at least two are notable. */
function salesContextWhy(e: AnomalyEventInput): string | null {
  const bits: string[] = [];
  const spend = paidSpendCents(e);
  const purchases = e.paid?.purchases ?? 0;
  const lift = organicLiftSold(e);
  const posts = promoPosts(e).length;
  if (spend >= 15000) {
    bits.push(
      purchases > 0
        ? `${fmtEur(spend / 100)} ad spend (${fmtCount(purchases)} platform-aankopen)`
        : `${fmtEur(spend / 100)} ad spend, geen platform-aankopen`,
    );
  }
  if (lift >= 20 && posts > 0) bits.push(`+${fmtCount(lift)} tickets rond de posts`);
  if (e.isOutdoor && e.weather && isPoorWeather(e.weather.kind)) {
    bits.push(weatherCause(e.weather.kind));
  } else if (e.isOutdoor && e.weather?.kind === "ideal") {
    bits.push("mooi weer");
  }
  if (e.competitionLevel != null && isHighImpact(e.competitionLevel)) {
    const festivals = e.competingFestivals.filter((c) => c.kind === "festival").length;
    bits.push(
      festivals > 0
        ? `${festivals} festival${festivals === 1 ? "" : "s"} dezelfde dag`
        : "een drukke stad",
    );
  } else if (e.competitionLevel != null && isLowImpact(e.competitionLevel)) {
    bits.push("weinig concurrentie");
  }
  if (e.djFeeInvestmentLevel != null && isHighImpact(e.djFeeInvestmentLevel)) {
    bits.push("hoge DJ-fees");
  } else if (e.djFeeInvestmentLevel != null && isLowImpact(e.djFeeInvestmentLevel)) {
    bits.push("lage DJ-fees");
  }
  if (bits.length < 2) return null;
  return `Meespelend: ${listNl(bits)}.`;
}

function paidRoasChipHint(e: AnomalyEventInput, fill: number): string {
  const purchases = e.paid?.purchases ?? 0;
  const sold = e.tickets.sold;
  const share = sold > 0 && purchases > 0 ? (purchases / sold) * 100 : 0;
  const lift = organicLiftSold(e);
  const days = e.tickets.soldOutDaysBefore;
  if (purchases === 0 || share < 15) {
    return `, met ${fmtCount(purchases)} platform-aankopen`;
  }
  if (days != null && days >= 2 && (isSoldOut(e) || fill >= 98)) {
    return ` — kaarten ${days}d eerder op`;
  }
  if (lift >= 25) return ` — social +${fmtCount(lift)}`;
  return "";
}

function detectPaid(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  if (e.status !== "past") return null;
  const fill = e.tickets.fillPct;
  if (fill == null || e.tickets.sold <= 0) return null;
  const spend = paidSpendCents(e);
  const ads = e.paid?.ads ?? 0;
  if (spend < 5000 || ads < 1) return null;
  const level = e.paidInvestmentLevel ?? null;
  const spendLabel = fmtEur(spend / 100);
  const roas = e.paid?.roas ?? null;
  const soldOut = isSoldOut(e);
  const highFill = peerFill(baselines.fillByPaid, [4, 5]);
  const lowFill = peerFill(baselines.fillByPaid, [1, 2]);
  const roasLabel = roas != null ? fmtRoas(roas) : null;
  const peer = roasPeer(e, baselines);
  const roasAvgLabel = peer ? fmtRoas(peer.median) : null;

  if (level != null && isHighImpact(level)) {
    const investLabel =
      level === 5 ? "Zeer hoge ad spend" : "Hoge ad spend";
    if (soldOut || fill >= 92) {
      return {
        text:
          roas != null && roas >= 2 && peer
            ? `${investLabel} — ROAS ${fmtRoas(roas)} tegen ${fmtRoas(peer.median)} gemiddeld${paidRoasChipHint(e, fill)}`
            : roas != null && roas >= 2
              ? `${investLabel} — ticket-ROAS ${fmtRoas(roas)}${paidRoasChipHint(e, fill)}`
              : `${investLabel} — toch vol`,
        tone: "positive",
        dimension: "paid",
        significance: 0.5,
        detail: `${investLabel.toLowerCase()} t.o.v. andere events (${spendLabel} · ${ads} ads). ${fmtPct(fill)} van de kaarten verkocht${roasLabel ? `. Ticketomzet / ad spend = ${roasLabel}` : ""}${peer ? `, vergelijkbare ${peer.label} met ads meestal ${fmtRoas(peer.median)}` : ""}. ${roas != null ? paidRoasWhy(e, fill) : ""}`,
        facts: facts(
          ["Ad-investering", `${level}/5`],
          ["Ad spend", spendLabel],
          ["Ads", String(ads)],
          ["Ticket-ROAS", roasLabel],
          ["Gemiddeld " + (peer?.label ?? "events"), roasAvgLabel],
          ["Platform-aankopen", fmtCount(e.paid?.purchases ?? 0)],
          ["Tickets rond posts", organicLiftSold(e) > 0 ? `+${fmtCount(organicLiftSold(e))}` : null],
          ["DJ-fees", djFeeLabel(e)],
          ["Verkocht", `${fmtPct(fill)} van de capaciteit`],
        ),
      };
    }
    const paidPeer = fillToBeat(
      highFill,
      baselines.all.fill?.median ?? null,
      fill,
    );
    if (paidPeer != null) {
      return {
        text: `${investLabel}, maar de verkoop bleef achter`,
        tone: "caution",
        dimension: "paid",
        significance: sigFromPp(paidPeer - fill, 22),
        detail: `${investLabel.toLowerCase()} t.o.v. andere events (${spendLabel}). Dit event was ${fmtPct(fill)} vol; vergelijkbare events zitten meestal rond ${fmtPct(paidPeer)} vol${roasLabel ? ` · ticket-ROAS ${roasLabel}` : ""}.`,
        facts: facts(
          ["Ad-investering", `${level}/5`],
          ["Dit event", fmtPct(fill)],
          ["Vergelijkbare events", fmtPct(paidPeer)],
          ["Ad spend", spendLabel],
          ["Ticket-ROAS", roasLabel],
          ["Gemiddeld " + (peer?.label ?? "events"), roasAvgLabel],
          ["DJ-fees", djFeeLabel(e)],
        ),
      };
    }
  }

  if (level != null && isLowImpact(level) && (soldOut || fill >= 92)) {
    return {
      text: "Weinig ad spend — toch vol",
      tone: "positive",
      dimension: "paid",
      significance: 0.46,
      detail: `Lage ad spend t.o.v. andere events (${spendLabel}). Dit event was ${fmtPct(fill)} vol${lowFill != null ? `; events met lage ad spend zitten meestal rond ${fmtPct(lowFill)} vol` : ""}${roasLabel ? ` · ticket-ROAS ${roasLabel}` : ""}.`,
      facts: facts(
        ["Ad-investering", `${level}/5`],
        ["Ad spend", spendLabel],
        ["Bezetting", fmtPct(fill)],
        ["Ticket-ROAS", roasLabel],
        ["Gemiddeld " + (peer?.label ?? "events"), roasAvgLabel],
        ["Events met lage ad spend", lowFill != null ? fmtPct(lowFill) : null],
      ),
    };
  }

  if (roas != null && roas < 1 && spend >= 20000) {
    const avgBit = peer
      ? ` Vergelijkbare ${peer.label} met ads zitten meestal rond ${fmtRoas(peer.median)}.`
      : "";
    return {
      text: peer
        ? `Ad spend hoger dan ticketomzet — ROAS ${fmtRoas(roas)} tegen ${fmtRoas(peer.median)} gemiddeld`
        : `Ad spend hoger dan ticketomzet (ROAS ${fmtRoas(roas)})`,
      tone: "caution",
      dimension: "paid",
      significance: Math.min(1, 0.4 + (1 - roas) * 0.35),
      detail: `Er ging ${spendLabel} naar ads, meer dan de ticketomzet (ROAS ${fmtRoas(roas)}). ${fmtPct(fill)} van de kaarten verkocht.${avgBit} ${paidRoasWhy(e, fill)}`,
      facts: facts(
        ["Ad spend", spendLabel],
        ["Ticket-ROAS dit event", roasLabel],
        ["Gemiddeld " + (peer?.label ?? "events"), roasAvgLabel],
        ["Verkocht", `${fmtPct(fill)} van de capaciteit`],
        ["DJ-fees", djFeeLabel(e)],
      ),
    };
  }

  if (roas != null && roas >= 4 && spend >= 10000 && (soldOut || fill >= 80)) {
    if (!peer || roas < peer.median * 1.8) return null;
    const purchases = e.paid?.purchases ?? 0;
    const purchaseShare =
      e.tickets.sold > 0 ? (purchases / e.tickets.sold) * 100 : 0;
    const adsDidntCarry = purchases === 0 || purchaseShare < 15;
    const text = adsDidntCarry
      ? `${spendLabel} ad spend, ${fmtCount(purchases)} platform-aankopen — ROAS ${fmtRoas(roas)} tegen ${fmtRoas(peer.median)} gemiddeld`
      : `${spendLabel} ad spend, ${fmtPct(fill)} verkocht — ROAS ${fmtRoas(roas)} tegen ${fmtRoas(peer.median)} gemiddeld`;
    return {
      text,
      tone: "positive",
      dimension: "paid",
      significance: Math.min(1, 0.5 + Math.min(0.25, (roas / peer.median - 1) / 8)),
      detail: `Ticketomzet gedeeld door ad spend is ${fmtRoas(roas)}. Vergelijkbare ${peer.label} met ads zitten meestal rond ${fmtRoas(peer.median)}. ${paidRoasWhy(e, fill)}`,
      facts: facts(
        ["Ticket-ROAS dit event", fmtRoas(roas)],
        ["Gemiddeld " + peer.label, fmtRoas(peer.median)],
        ["Ad spend", spendLabel],
        ["Platform-aankopen", fmtCount(purchases)],
        ["Tickets rond posts", organicLiftSold(e) > 0 ? `+${fmtCount(organicLiftSold(e))}` : null],
        ["Verkocht", `${fmtPct(fill)} van de capaciteit`],
        ["DJ-fees", djFeeLabel(e)],
      ),
    };
  }

  return null;
}

function detectInvestment(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  if (e.status !== "past") return null;
  const feeMid = e.djFees?.spend ? djFeeSpendMidpoint(e.djFees.spend) : null;
  const paidEur = paidSpendCents(e) / 100;
  if (feeMid == null || paidEur < 50) return null;
  const fill = e.tickets.fillPct;
  if (fill == null || e.tickets.sold <= 0) return null;
  const level = e.investmentLevel ?? null;
  if (level == null) return null;
  const combined = feeMid + paidEur;
  const spendLabel = `${djFeeLabel(e) ?? "—"} DJ · ${fmtEur(paidEur)} ad spend`;
  const soldOut = isSoldOut(e);
  const highFill = peerFill(baselines.fillByInvestment, [4, 5]);
  const lowFill = peerFill(baselines.fillByInvestment, [1, 2]);

  if (isHighImpact(level)) {
    const investLabel =
      level === 5 ? "Zeer hoge totale investering" : "Hoge totale investering";
    if (soldOut || fill >= 92) {
      return {
        text: `${investLabel} — toch vol`,
        tone: "positive",
        dimension: "investment",
        significance: 0.54,
        detail: `${investLabel.toLowerCase()} t.o.v. andere events (DJ-fees + ads ≈ ${fmtEur(combined)}). Dit event was ${fmtPct(fill)} vol — de inkoop en media werden dus gedragen. DJ-fees zijn bandbreedtes.`,
        facts: facts(
          ["Totale investering", `${level}/5`],
          ["DJ-fees + ads", fmtEur(combined)],
          ["DJ-fees", djFeeLabel(e)],
          ["Ad spend", fmtEur(paidEur)],
          ["Ticket-ROAS", e.paid?.roas != null ? `${e.paid.roas.toFixed(1)}×` : null],
          ["Bezetting", fmtPct(fill)],
        ),
      };
    }
    const investPeer = fillToBeat(
      highFill,
      baselines.all.fill?.median ?? null,
      fill,
    );
    if (investPeer != null) {
      return {
        text: `${investLabel}, maar de verkoop bleef achter`,
        tone: "caution",
        dimension: "investment",
        significance: sigFromPp(investPeer - fill, 20),
        detail: `${investLabel.toLowerCase()} t.o.v. andere events (${spendLabel}, midden ≈ ${fmtEur(combined)}). Dit event was ${fmtPct(fill)} vol; vergelijkbare events zitten meestal rond ${fmtPct(investPeer)} vol.`,
        facts: facts(
          ["Totale investering", `${level}/5`],
          ["Dit event", fmtPct(fill)],
          ["Vergelijkbare events", fmtPct(investPeer)],
          ["DJ-fees", djFeeLabel(e)],
          ["Ad spend", fmtEur(paidEur)],
        ),
      };
    }
  }

  if (isLowImpact(level) && (soldOut || fill >= 92)) {
    return {
      text: "Lage DJ-fees én ad spend — toch vol",
      tone: "positive",
      dimension: "investment",
      significance: 0.48,
      detail: `Lage totale investering t.o.v. andere events (${spendLabel}). Dit event was ${fmtPct(fill)} vol${lowFill != null ? `; events met een lage investering zitten meestal rond ${fmtPct(lowFill)} vol` : ""}.`,
      facts: facts(
        ["Totale investering", `${level}/5`],
        ["DJ-fees", djFeeLabel(e)],
        ["Ad spend", fmtEur(paidEur)],
        ["Bezetting", fmtPct(fill)],
        ["Events met lage investering", lowFill != null ? fmtPct(lowFill) : null],
      ),
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
      text: `Niet uitverkocht — vergelijkbare events waren de kaarten eerder kwijt`,
      tone: "caution",
      dimension: "soldout",
      significance: 0.42,
      detail: `Dit event verkocht ${fmtPct(e.tickets.fillPct)} van de kaarten en raakte niet uitverkocht. Bij vergelijkbare ${cohort.label} die wél uitverkochten, waren de kaarten gemiddeld ${Math.round(cohort.soldOutDays.median)} dagen vóór de eventdag al op.`,
      facts: facts(
        ["Kaarten verkocht", fmtPct(e.tickets.fillPct)],
        ["Vergelijkbaar uitverkocht", `${Math.round(cohort.soldOutDays.median)}d vóór de eventdag`],
      ),
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
          ? `Dit event was het snelst uitverkocht in ${year}: ${days} dagen vóór de eventdag waren de kaarten op. De nummer twee was ${second} dagen van tevoren uitverkocht.`
          : `Dit event was het snelst uitverkocht in ${year}: ${days} dagen vóór de eventdag waren de kaarten op.`,
      facts: facts(
        ["Uitverkocht", `${days}d vóór`],
        ["Nummer twee", second != null ? `${second}d vóór` : null],
      ),
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
        detail: "Uitverkocht op de eventdag zelf — de laatste kaarten gingen dus pas laat weg.",
        facts: facts(["Uitverkocht", "op de eventdag"]),
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
    detail:
      delta > 0
        ? `De kaarten waren ${days} dagen vóór de eventdag op. Uitverkochte ${cohort.label} zijn meestal ${Math.round(cohort.soldOutDays.median)} dagen van tevoren uitverkocht.`
        : `De kaarten waren ${days} dagen vóór de eventdag op — later dan gebruikelijk. Uitverkochte ${cohort.label} zijn meestal ${Math.round(cohort.soldOutDays.median)} dagen van tevoren uitverkocht.`,
    facts: facts(
      ["Dit event", `${days}d vóór`],
      ["Vergelijkbare " + cohort.label, `${Math.round(cohort.soldOutDays.median)}d vóór`],
    ),
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
        ? "Meer last-minute verkoop dan gebruikelijk"
        : "Bijna alles vooraf verkocht — weinig aan de deur",
    tone: delta > 0 ? "neutral" : "positive",
    dimension: "same_day",
    significance,
    detail:
      delta > 0
        ? `${fmtPct(share)} van de kaarten ging op de eventdag zelf weg. Bij vergelijkbare ${cohort.label} is dat meestal ${fmtPct(cohort.sameDayShare.median)} — dus meer last-minute dan gebruikelijk.`
        : `${fmtPct(share)} van de kaarten ging op de eventdag zelf weg. Bij vergelijkbare ${cohort.label} is dat meestal ${fmtPct(cohort.sameDayShare.median)} — het meeste was dus al vooraf verkocht.`,
    facts: facts(
      ["Last-minute dit event", fmtPct(share)],
      ["Vergelijkbare " + cohort.label, fmtPct(cohort.sameDayShare.median)],
      ["Tickets op de dag", e.tickets.sameDaySold != null ? fmtCount(e.tickets.sameDaySold) : null],
    ),
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
  detectDjFees,
  detectPaid,
  detectInvestment,
  detectSoldout,
  detectSameDay,
];

/** Topics the combined story already explains, so they don't get a second chip. */
const STORY_COVERS = new Set<AnomalyDimension>([
  "fill",
  "weather",
  "competition",
  "social",
  "dj_fees",
  "paid",
  "investment",
]);

function listNl(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} en ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} en ${items[items.length - 1]}`;
}

function organicLiftSold(e: AnomalyEventInput): number {
  return promoPosts(e).reduce((sum, post) => sum + (post.ticketLiftSold ?? 0), 0);
}

function paidNearEvent(e: AnomalyEventInput): boolean {
  const windowStart = shiftIso(e.day, -14);
  const ads = e.paidAds ?? [];
  if (ads.length > 0) {
    return ads.some((ad) => {
      const day = (ad.dateStart ?? ad.publishedAt ?? "").slice(0, 10);
      return Boolean(day) && day >= windowStart && day <= e.day && ad.spendCents > 0;
    });
  }
  return paidSpendCents(e) >= 15000;
}

type StoryRead = {
  sold: number;
  fill: number;
  fillDelta: number;
  soldOut: boolean;
  cohortLabel: string;
  cohortFill: number;
  weatherPhrase: string | null;
  weatherAdverse: boolean;
  weatherFavorable: boolean;
  competitionPhrase: string | null;
  competitionAdverse: boolean;
  competitionFavorable: boolean;
  organicPosts: number;
  organicLift: number;
  organicStrong: boolean;
  paidSpendEur: number;
  paidPurchases: number;
  purchaseShare: number | null;
  paidSpendHigh: boolean;
  paidWeak: boolean;
  paidCarried: boolean;
  paidNear: boolean;
  djHigh: boolean;
  djLow: boolean;
  djLabel: string | null;
  pace7: number | null;
  pace7Peer: number | null;
  festivalNames: string[];
};

function weatherStoryBit(e: AnomalyEventInput): {
  phrase: string;
  adverse: boolean;
  favorable: boolean;
} | null {
  if (!e.isOutdoor || !e.weather || e.weather.kind === "ok") return null;
  if (e.weather.kind === "ideal") {
    return { phrase: "mooi weer", adverse: false, favorable: true };
  }
  const phrase =
    e.weather.kind === "heat"
      ? "hitte"
      : e.weather.kind === "wet"
        ? "regen"
        : e.weather.kind === "cold_wet"
          ? "koud en nat weer"
          : e.weather.kind === "cold"
            ? "kou"
            : e.weather.kind === "windy"
              ? "harde wind"
              : e.weather.label.toLowerCase();
  return { phrase, adverse: true, favorable: false };
}

function competitionStoryBit(e: AnomalyEventInput): {
  phrase: string;
  adverse: boolean;
  favorable: boolean;
} | null {
  if (e.competitionLevel == null) return null;
  const festivals = e.competingFestivals.filter((c) => c.kind === "festival");
  if (isHighImpact(e.competitionLevel)) {
    const phrase =
      festivals.length > 0
        ? `${festivals.length} festival${festivals.length === 1 ? "" : "s"} dezelfde dag`
        : "een drukke stad";
    return { phrase, adverse: true, favorable: false };
  }
  if (isLowImpact(e.competitionLevel)) {
    return { phrase: "weinig concurrentie", adverse: false, favorable: true };
  }
  return null;
}

function readStory(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): StoryRead | null {
  if (e.status !== "past") return null;
  const fill = e.tickets.fillPct;
  if (fill == null || e.tickets.sold <= 0) return null;
  const cohort = resolveCohort(e, baselines, "fill");
  if (!cohort?.fill) return null;

  const weather = weatherStoryBit(e);
  const competition = competitionStoryBit(e);
  const posts = promoPosts(e);
  const lift = organicLiftSold(e);
  const level = e.organicImpactLevel;
  const organicStrong = (level != null && isHighImpact(level)) || lift >= 40;
  const spendEur = paidSpendCents(e) / 100;
  const purchases = e.paid?.purchases ?? 0;
  const purchaseShare =
    e.tickets.sold > 0 && purchases > 0
      ? Math.min(100, (purchases / e.tickets.sold) * 100)
      : null;
  const paidLevel = e.paidInvestmentLevel ?? null;
  const paidSpendHigh =
    (paidLevel != null && isHighImpact(paidLevel)) || spendEur >= 400;
  const paidWeak =
    spendEur >= 200 &&
    (purchaseShare == null || purchaseShare < 12) &&
    purchases < 30 &&
    lift >= 25 &&
    lift > Math.max(purchases, 1) * 1.5;
  const paidCarried =
    purchases >= 30 &&
    purchaseShare != null &&
    purchaseShare >= 20 &&
    lift < purchases * 0.55;
  const paceCohort = resolveCohort(e, baselines, "pace7");

  return {
    sold: e.tickets.sold,
    fill,
    fillDelta: fill - cohort.fill.median,
    soldOut: isSoldOut(e),
    cohortLabel: cohort.label,
    cohortFill: cohort.fill.median,
    weatherPhrase: weather?.phrase ?? null,
    weatherAdverse: weather?.adverse ?? false,
    weatherFavorable: weather?.favorable ?? false,
    competitionPhrase: competition?.phrase ?? null,
    competitionAdverse: competition?.adverse ?? false,
    competitionFavorable: competition?.favorable ?? false,
    organicPosts: posts.length,
    organicLift: lift,
    organicStrong,
    paidSpendEur: spendEur,
    paidPurchases: purchases,
    purchaseShare,
    paidSpendHigh,
    paidWeak,
    paidCarried,
    paidNear: paidNearEvent(e),
    djHigh: e.djFeeInvestmentLevel != null && isHighImpact(e.djFeeInvestmentLevel),
    djLow: e.djFeeInvestmentLevel != null && isLowImpact(e.djFeeInvestmentLevel),
    djLabel: djFeeLabel(e),
    pace7: paceShare(e, 7),
    pace7Peer: paceCohort?.pace7?.median ?? null,
    festivalNames: e.competingFestivals
      .filter((c) => c.kind === "festival")
      .slice(0, 3)
      .map((c) => c.name),
  };
}

function storyFacts(e: AnomalyEventInput, ctx: StoryRead): AnomalyFact[] {
  return facts(
    ["Dit event", fmtPct(ctx.fill)],
    ["Vergelijkbare " + ctx.cohortLabel, fmtPct(ctx.cohortFill)],
    ["Weer", e.isOutdoor ? e.weather?.label ?? null : null],
    ["Concurrentie", ctx.competitionPhrase],
    ["Festivals", ctx.festivalNames.length ? ctx.festivalNames.join(", ") : null],
    ["Promo-posts", ctx.organicPosts > 0 ? String(ctx.organicPosts) : "0"],
    [
      "Tickets rond posts",
      ctx.organicLift > 0 ? `+${fmtCount(ctx.organicLift)}` : null,
    ],
    ["Ad spend", ctx.paidSpendEur >= 50 ? fmtEur(ctx.paidSpendEur) : "geen"],
    [
      "Ad-aankopen",
      ctx.paidPurchases > 0
        ? fmtCount(ctx.paidPurchases)
        : ctx.paidSpendEur >= 50
          ? "0"
          : null,
    ],
    [
      "Aandeel via ads",
      ctx.purchaseShare != null ? fmtPct(ctx.purchaseShare) : null,
    ],
    ["DJ-fees", ctx.djLabel],
    ["Verkocht 7d vóór", ctx.pace7 != null ? fmtPct(ctx.pace7) : null],
    [
      "Vergelijkbaar 7d vóór",
      ctx.pace7Peer != null ? fmtPct(ctx.pace7Peer) : null,
    ],
  );
}

function conditionsSentence(ctx: StoryRead): string | null {
  const bits = [ctx.weatherPhrase, ctx.competitionPhrase].filter(
    (bit): bit is string => Boolean(bit),
  );
  if (bits.length === 0) return null;
  return `Omstandigheden: ${listNl(bits)}.`;
}

function marketingSentence(ctx: StoryRead): string {
  const bits: string[] = [];
  if (ctx.paidSpendEur >= 50) {
    const purchases =
      ctx.paidPurchases > 0
        ? `${fmtCount(ctx.paidPurchases)} aankopen`
        : "geen platform-aankopen";
    bits.push(`${fmtEur(ctx.paidSpendEur)} ad spend (${purchases})`);
  } else {
    bits.push("nauwelijks ad spend");
  }
  if (ctx.organicPosts > 0) {
    const postLabel =
      ctx.organicPosts === 1 ? "1 promo-post" : `${ctx.organicPosts} promo-posts`;
    const lift =
      ctx.organicLift > 0
        ? ` (+${fmtCount(ctx.organicLift)} tickets eromheen)`
        : "";
    bits.push(`${postLabel}${lift}`);
  } else {
    bits.push("geen promo-posts vooraf");
  }
  if (ctx.djLabel) bits.push(`DJ-fees ${ctx.djLabel}`);
  return `Marketing en lineup: ${listNl(bits)}.`;
}

function paceSentence(ctx: StoryRead): string | null {
  if (ctx.pace7 == null || ctx.pace7Peer == null) return null;
  const delta = ctx.pace7 - ctx.pace7Peer;
  if (Math.abs(delta) < 15) return null;
  if (delta <= -15 && ctx.fillDelta >= -6) {
    return `Een week van tevoren was ${fmtPct(ctx.pace7)} van de kaarten weg. Bij vergelijkbare ${ctx.cohortLabel} is dat meestal ${fmtPct(ctx.pace7Peer)}. De eindstand haalde dat in.`;
  }
  if (delta <= -15) {
    return `Een week van tevoren was pas ${fmtPct(ctx.pace7)} van de kaarten weg (vergelijkbare ${ctx.cohortLabel}: ${fmtPct(ctx.pace7Peer)}), en de eindstand bleef achter.`;
  }
  if (ctx.fillDelta <= -8) {
    return `Een week van tevoren lag de verkoop voor (${fmtPct(ctx.pace7)} vs ${fmtPct(ctx.pace7Peer)}), daarna vlakte die af.`;
  }
  return `Een week van tevoren lag de verkoop voor op vergelijkbare ${ctx.cohortLabel} (${fmtPct(ctx.pace7)} vs ${fmtPct(ctx.pace7Peer)}).`;
}

function contextCount(flags: boolean[]): number {
  return flags.filter(Boolean).length;
}

type StoryDraft = {
  text: string;
  tone: AnomalyInsight["tone"];
  significance: number;
  kind: "outcome" | "levers" | "pace";
};

function resilienceDraft(ctx: StoryRead): StoryDraft | null {
  const pressure = [
    ctx.weatherAdverse ? ctx.weatherPhrase : null,
    ctx.competitionAdverse ? ctx.competitionPhrase : null,
  ].filter((bit): bit is string => Boolean(bit));
  const adverse = [ctx.weatherAdverse, ctx.competitionAdverse];
  const contrast = [
    ctx.paidCarried,
    ctx.organicStrong && ctx.organicLift >= 25,
    ctx.djLow && ctx.paidSpendEur < 200,
    ctx.djHigh,
    ctx.paidWeak,
  ];
  const heldUp =
    ctx.soldOut || ctx.fill >= Math.min(96, Math.max(80, ctx.cohortFill - 3));
  if (!heldUp || contextCount([...adverse, ...contrast]) < 2) return null;
  if (!adverse.some(Boolean)) return null;

  const despite = listNl(pressure);
  const lead = ctx.soldOut
    ? `Uitverkocht ondanks ${despite}`
    : `${fmtPct(ctx.fill)} vol ondanks ${despite}`;
  let tail: string | null = null;
  if (ctx.paidCarried) {
    tail = `${fmtCount(ctx.paidPurchases)} aankopen via ads`;
  } else if (ctx.organicStrong && ctx.organicLift >= 25) {
    tail = `social +${fmtCount(ctx.organicLift)} tickets`;
  } else if (ctx.paidWeak) {
    tail = "social wel, ads nauwelijks";
  } else if (ctx.djLow && ctx.paidSpendEur < 200) {
    tail = ctx.paidSpendEur < 80 ? "lage DJ-fees en weinig ads" : "lage DJ-fees";
  } else if (ctx.djHigh) {
    tail = "hoge DJ-fees";
  }

  return {
    text: tail ? `${lead} — ${tail}` : lead,
    tone: "positive",
    significance: Math.min(0.96, 0.7 + 0.05 * contextCount([...adverse, ...contrast])),
    kind: "outcome",
  };
}

function shortfallDraft(ctx: StoryRead): StoryDraft | null {
  if (ctx.soldOut || ctx.fillDelta > -12) return null;
  if (ctx.paidWeak) {
    const favorableNow = [
      ctx.weatherFavorable ? ctx.weatherPhrase : null,
      ctx.competitionFavorable ? ctx.competitionPhrase : null,
    ].filter((bit): bit is string => Boolean(bit));
    const nice = favorableNow.length ? ` bij ${listNl(favorableNow)}` : "";
    const fees = ctx.djHigh ? "Hoge DJ-fees en " : "";
    return {
      text: `${fees}${fmtEur(ctx.paidSpendEur)} ad spend, ${fmtCount(ctx.paidPurchases)} aankopen — maar ${fmtPct(ctx.fill)} verkocht${nice}`,
      tone: "caution",
      significance: Math.min(0.95, 0.78 + sigFromPp(ctx.fillDelta, 28) * 0.15),
      kind: "outcome",
    };
  }
  const favorable = [
    ctx.weatherFavorable ? ctx.weatherPhrase : null,
    ctx.competitionFavorable ? ctx.competitionPhrase : null,
  ].filter((bit): bit is string => Boolean(bit));
  const pressure = ctx.weatherAdverse || ctx.competitionAdverse;
  const investment = [
    ctx.djHigh,
    ctx.paidSpendHigh || ctx.paidWeak,
    ctx.organicStrong && ctx.organicLift >= 25,
  ];
  const favorableCount = favorable.length;
  const invested = contextCount(investment);
  if (pressure && ctx.fillDelta > -20) return null;
  if (favorableCount + invested < 2 && !(pressure && invested >= 1 && ctx.fillDelta <= -20)) {
    return null;
  }

  const nice = favorable.length ? ` bij ${listNl(favorable)}` : "";
  const weak = `maar ${fmtPct(ctx.fill)} verkocht`;
  let text: string;
  if (ctx.djHigh && ctx.paidSpendHigh) {
    text = `Hoge DJ-fees én ${fmtEur(ctx.paidSpendEur)} ad spend, ${weak}${nice}`;
  } else if (ctx.djHigh) {
    text = `Hoge DJ-fees, ${weak}${nice}`;
  } else if (ctx.organicStrong && ctx.paidSpendHigh) {
    text = `Sterke social en ${fmtEur(ctx.paidSpendEur)} ad spend, ${weak}${nice}`;
  } else if (ctx.organicStrong) {
    text = `Sterke social (+${fmtCount(ctx.organicLift)}), ${weak}${nice}`;
  } else if (ctx.paidSpendHigh && favorable.length >= 1) {
    text = `${fmtEur(ctx.paidSpendEur)} ad spend, ${weak}${nice}`;
  } else if (favorable.length >= 2) {
    text = `${weak} bij ${listNl(favorable)}`;
  } else {
    return null;
  }

  return {
    text,
    tone: "caution",
    significance: Math.min(0.95, 0.74 + sigFromPp(ctx.fillDelta, 28) * 0.2),
    kind: "outcome",
  };
}

function leverDraft(ctx: StoryRead): StoryDraft | null {
  if (ctx.fillDelta <= -12) return null;
  if (ctx.paidWeak) {
    return {
      text: `Tickets liepen via social (+${fmtCount(ctx.organicLift)}), niet via ads (${fmtCount(ctx.paidPurchases)} aankopen bij ${fmtEur(ctx.paidSpendEur)})`,
      tone: "neutral",
      significance: 0.68,
      kind: "levers",
    };
  }
  if (ctx.paidCarried && (ctx.organicPosts === 0 || ctx.organicLift < 15)) {
    const share =
      ctx.purchaseShare != null ? ` (${fmtPct(ctx.purchaseShare)})` : "";
    const late =
      ctx.pace7 != null &&
      ctx.pace7Peer != null &&
      ctx.pace7 <= ctx.pace7Peer - 18
        ? ", en de kaarten kwamen laat op gang"
        : "";
    return {
      text: `${fmtCount(ctx.paidPurchases)} van ${fmtCount(ctx.sold)} tickets via ads${share} — posts droegen weinig bij${late}`,
      tone: "positive",
      significance: 0.66,
      kind: "levers",
    };
  }
  return null;
}

function paceDraft(ctx: StoryRead): StoryDraft | null {
  if (ctx.pace7 == null || ctx.pace7Peer == null) return null;
  const delta = ctx.pace7 - ctx.pace7Peer;
  if (Math.abs(delta) < 18) return null;
  const attached =
    ctx.paidNear ||
    ctx.organicLift >= 20 ||
    ctx.weatherAdverse ||
    ctx.weatherFavorable ||
    ctx.competitionAdverse ||
    ctx.competitionFavorable;
  if (!attached) return null;

  if (delta <= -18 && ctx.fillDelta >= -6) {
    const via =
      ctx.paidNear && ctx.paidPurchases >= 15
        ? ` — daarna ${fmtCount(ctx.paidPurchases)} aankopen via ads`
        : ctx.organicLift >= 20
          ? ` — daarna social +${fmtCount(ctx.organicLift)}`
          : ", daarna ingelopen";
    return {
      text: `Een week van tevoren achter (${fmtPct(ctx.pace7)} vs ${fmtPct(ctx.pace7Peer)})${via}`,
      tone: "neutral",
      significance: Math.min(0.84, 0.6 + sigFromPp(delta, 36) * 0.25),
      kind: "pace",
    };
  }
  if (delta >= 18 && ctx.fillDelta <= -8) {
    return {
      text: `Sterke start (${fmtPct(ctx.pace7)} vs ${fmtPct(ctx.pace7Peer)} een week van tevoren), daarna vlak op ${fmtPct(ctx.fill)}`,
      tone: "caution",
      significance: Math.min(0.84, 0.62 + sigFromPp(delta, 36) * 0.2),
      kind: "pace",
    };
  }
  if (delta <= -18 && ctx.fillDelta <= -8) {
    const why = ctx.weatherAdverse && ctx.weatherPhrase
      ? ` bij ${ctx.weatherPhrase}`
      : ctx.competitionAdverse && ctx.competitionPhrase
        ? ` bij ${ctx.competitionPhrase}`
        : "";
    return {
      text: `Verkoop liep de hele aanloop achter (${fmtPct(ctx.pace7)} vs ${fmtPct(ctx.pace7Peer)} een week van tevoren)${why}`,
      tone: "caution",
      significance: 0.6,
      kind: "pace",
    };
  }
  return null;
}

function detectStory(
  e: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight | null {
  const ctx = readStory(e, baselines);
  if (!ctx) return null;

  const outcome = [resilienceDraft(ctx), shortfallDraft(ctx)]
    .filter((draft): draft is StoryDraft => draft != null)
    .sort((a, b) => b.significance - a.significance)[0];
  const best = outcome ?? leverDraft(ctx) ?? paceDraft(ctx);
  if (!best) return null;

  const pace = paceSentence(ctx);
  const mentionsSource =
    best.kind === "levers" ||
    ctx.paidCarried ||
    ctx.paidWeak ||
    ctx.organicLift >= 25;
  const detail = [
    `Dit event was ${fmtPct(ctx.fill)} vol. Vergelijkbare ${ctx.cohortLabel} zitten meestal rond ${fmtPct(ctx.cohortFill)} vol.`,
    conditionsSentence(ctx),
    marketingSentence(ctx),
    best.kind === "pace" ? null : pace,
    mentionsSource
      ? "Dat is een samenhang tussen verkoop, posts en ads, geen harde toewijzing."
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");

  return {
    text: best.text,
    tone: best.tone,
    dimension: "story",
    significance: best.significance,
    detail,
    facts: storyFacts(e, ctx),
    coversTiming: best.kind === "pace" || pace != null,
  };
}

/**
 * Ranked anomaly insights for one event.
 * A combined story leads when sales diverge from the other signals.
 * Chips that repeat that story are dropped. Otherwise up to 5 single-topic chips.
 */
export function detectAnomalies(
  event: AnomalyEventInput,
  baselines: AnomalyBaselines,
): AnomalyInsight[] {
  const story = detectStory(event, baselines);
  const rest: AnomalyInsight[] = [];
  for (const detect of DETECTORS) {
    const hit = detect(event, baselines);
    if (!hit || hit.significance < SIGNIFICANCE_FLOOR) continue;
    if (story) {
      if (STORY_COVERS.has(hit.dimension)) continue;
      if (hit.dimension === "soldout" && (story.coversTiming || hit.significance < 0.85)) {
        continue;
      }
      if (hit.dimension === "same_day" && (story.coversTiming || hit.significance < 0.7)) {
        continue;
      }
    }
    rest.push(hit);
  }

  rest.sort((a, b) => b.significance - a.significance);
  if (story && story.significance >= SIGNIFICANCE_FLOOR) {
    return [story, ...rest].slice(0, 3);
  }
  return rest.slice(0, MAX_INSIGHTS);
}

/** Apply baselines + detection across a list (mutates `insights` via callback). */
export function annotateAnomalies<T extends AnomalyEventInput>(
  events: T[],
): AnomalyInsight[][] {
  const baselines = computeBaselines(events);
  return events.map((e) => detectAnomalies(e, baselines));
}
