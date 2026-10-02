/**
 * Verzendritme voor outreach — bepaald door ons, niet handmatig in Instellingen.
 *
 * Zonder genoeg eigen open-data: Benelux B2B-benchmark
 * (di/do · ochtendvenster rond 9–10 Amsterdam · max 3/dag).
 * Met genoeg opens: top-dagen + piekuur uit Amsterdam-local opens.
 * Exacte minuten variëren per mail (geen klokslag :00).
 */

import { cache } from "react";
import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";

export type CadenceSource = "benchmark" | "opens";

export type ResolvedCadence = {
  /** ISO weekdays: 1=ma … 5=vr */
  sendWeekdays: number[];
  mailsPerDay: number;
  /** Center of morning window (Amsterdam hour). */
  preferredHour: number;
  source: CadenceSource;
  /** Opens used when source=opens; else 0 */
  sampleOpens: number;
  rationale: string;
};

/** Conservatief warm-up: di + do, ochtend-inbox Benelux. */
export const BENCHMARK_CADENCE: Omit<
  ResolvedCadence,
  "source" | "sampleOpens" | "rationale"
> = {
  sendWeekdays: [2, 4],
  mailsPerDay: 3,
  preferredHour: 9,
};

/** Minimaal aantal opens voordat we weekdays/hour uit data overschrijven. */
export const CADENCE_MIN_OPENS = 20;

/**
 * Morning window around preferredHour (minutes from midnight).
 * preferred 9 → roughly 08:40–10:25 — natural inbox time, not clock-on-the-hour.
 */
export function morningWindowMinutes(preferredHour: number): {
  start: number;
  end: number;
} {
  const center = Math.max(0, Math.min(23, preferredHour)) * 60;
  return {
    start: Math.max(8 * 60 + 20, center - 25),
    end: Math.min(11 * 60 + 30, center + 85),
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = ((totalMinutes % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Stable staggered send times for one day — irregular minutes, spaced apart.
 * Seed keeps the same plan across page refreshes for the same bakje/day.
 */
export function staggeredSendTimes(input: {
  preferredHour: number;
  count: number;
  seed: string;
}): string[] {
  const count = Math.max(0, input.count);
  if (count === 0) return [];

  const { start, end } = morningWindowMinutes(input.preferredHour);
  const span = Math.max(30, end - start);
  const rand = mulberry32(hashSeed(input.seed));

  if (count === 1) {
    const jitter = Math.floor(rand() * Math.min(45, span - 5));
    // Prefer non-round minutes (avoid :00 / :30 feel when possible).
    let minute = start + jitter;
    if (minute % 15 === 0) minute += 7 + Math.floor(rand() * 5);
    return [formatHm(Math.min(end - 1, minute))];
  }

  const gap = span / (count + 1);
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = start + gap * (i + 1);
    const wobble = Math.floor((rand() - 0.5) * Math.min(18, gap * 0.6));
    let minute = Math.round(base + wobble);
    // Nudge off exact :00 / :15 / :30 / :45.
    if (minute % 15 === 0) minute += 4 + Math.floor(rand() * 7);
    minute = Math.max(start, Math.min(end - 1, minute));
    // Keep ascending order with ≥12 min between sends.
    if (times.length > 0 && minute < times[times.length - 1]! + 12) {
      minute = times[times.length - 1]! + 12 + Math.floor(rand() * 8);
    }
    times.push(Math.min(end - 1, minute));
  }

  return times.map(formatHm);
}

export function formatMorningWindowLabel(preferredHour: number): string {
  const { start, end } = morningWindowMinutes(preferredHour);
  return `${formatHm(start)}–${formatHm(end)}`;
}

const DAY_NL = ["", "ma", "di", "wo", "do", "vr", "za", "zo"];

function topKeys(counts: Map<number, number>, limit: number): number[] {
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([k]) => k)
    .sort((a, b) => a - b);
}

function modeKey(counts: Map<number, number>): number | null {
  let best: number | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

type OpenBuckets = {
  total: number;
  byDow: Map<number, number>;
  byHour: Map<number, number>;
};

async function loadOpenBuckets(): Promise<OpenBuckets> {
  const empty: OpenBuckets = {
    total: 0,
    byDow: new Map(),
    byHour: new Map(),
  };
  if (!hasDatabase()) return empty;

  const db = getDb();
  const [dowRows, hourRows] = await Promise.all([
    db.execute<{ dow: number; opens: number }>(sql`
      select
        extract(isodow from opened_at at time zone 'Europe/Amsterdam')::int as dow,
        count(*)::int as opens
      from outreach_emails
      where opened_at is not null
      group by 1
    `),
    db.execute<{ hour: number; opens: number }>(sql`
      select
        extract(hour from opened_at at time zone 'Europe/Amsterdam')::int as hour,
        count(*)::int as opens
      from outreach_emails
      where opened_at is not null
      group by 1
    `),
  ]);

  const byDow = new Map<number, number>();
  const byHour = new Map<number, number>();
  let total = 0;

  for (const row of dowRows) {
    const dow = Number(row.dow);
    const n = Number(row.opens) || 0;
    total += n;
    if (dow >= 1 && dow <= 5) byDow.set(dow, n);
  }
  for (const row of hourRows) {
    const hour = Number(row.hour);
    const n = Number(row.opens) || 0;
    if (hour >= 0 && hour <= 23) byHour.set(hour, n);
  }

  return { total, byDow, byHour };
}

/**
 * Resolve cadence: learn from opens when enough samples, else Benelux benchmark.
 */
export const resolveOutreachCadence = cache(
  async (): Promise<ResolvedCadence> => {
    const buckets = await loadOpenBuckets();

    if (buckets.total < CADENCE_MIN_OPENS) {
      return {
        ...BENCHMARK_CADENCE,
        source: "benchmark",
        sampleOpens: buckets.total,
        rationale:
          buckets.total === 0
            ? "Nog geen eigen open-data — Benelux B2B-benchmark (di/do · ochtendvenster ~08:40–10:25, tijden per mail gespreid)."
            : `Nog ${CADENCE_MIN_OPENS - buckets.total} opens nodig voor eigen ritme — nu benchmark di/do · ochtendvenster.`,
      };
    }

    const learnedDays = topKeys(buckets.byDow, 2);
    const sendWeekdays =
      learnedDays.length > 0
        ? learnedDays
        : [...BENCHMARK_CADENCE.sendWeekdays];

    // Prefer morning peak (8–11); fall back to overall modal in work hours.
    const morning = new Map(
      [...buckets.byHour.entries()].filter(([h]) => h >= 8 && h <= 11),
    );
    const work = new Map(
      [...buckets.byHour.entries()].filter(([h]) => h >= 8 && h <= 17),
    );
    const preferredHour =
      modeKey(morning) ??
      modeKey(work) ??
      BENCHMARK_CADENCE.preferredHour;

    const dayLabel = sendWeekdays
      .map((d) => DAY_NL[d] ?? String(d))
      .join("/");
    const window = formatMorningWindowLabel(preferredHour);

    return {
      sendWeekdays,
      mailsPerDay: BENCHMARK_CADENCE.mailsPerDay,
      preferredHour,
      source: "opens",
      sampleOpens: buckets.total,
      rationale: `Op basis van ${buckets.total} opens: ${dayLabel} · venster ${window} · max ${BENCHMARK_CADENCE.mailsPerDay}/dag, tijden per mail gespreid.`,
    };
  },
);

export function formatResolvedCadence(c: ResolvedCadence): string {
  const days = c.sendWeekdays
    .map((d) => DAY_NL[d] ?? String(d))
    .join(" · ");
  const perWeek = c.sendWeekdays.length * c.mailsPerDay;
  const src =
    c.source === "opens"
      ? `eigen data (${c.sampleOpens} opens)`
      : "benchmark";
  const window = formatMorningWindowLabel(c.preferredHour);
  return `Max ${c.mailsPerDay}/dag op ${days} (~${perWeek}/week) · venster ${window} · ${src}`;
}
