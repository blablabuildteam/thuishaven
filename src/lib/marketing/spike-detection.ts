/**
 * Spike detection for organic post attribution.
 *
 * Instead of arbitrary ±48h windows, we:
 * 1. Build an hourly ticket sales curve
 * 2. Calculate a rolling baseline (expected sales rate)
 * 3. Detect spikes (hours significantly above baseline)
 * 4. Match spikes to posts published within 4h prior
 *
 * This gives much more honest attribution: "a spike occurred after this post"
 * rather than "X tickets sold during this arbitrary window".
 */

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ticketSales } from "@/lib/db/schema";
import { amsterdamDay, shiftIsoDay } from "@/lib/time/amsterdam";

/** Minimum spike size to consider (absolute tickets) */
const MIN_SPIKE_SIZE = 5;

/** Spike must be at least this multiple of the baseline */
const SPIKE_MULTIPLIER = 2.0;

/** Hours to look back for a post that might have caused the spike */
const POST_WINDOW_HOURS = 4;

/** Rolling window for baseline calculation (hours) */
const BASELINE_WINDOW_HOURS = 24;

export type HourlySales = {
  hour: Date;
  sold: number;
};

export type SalesSpike = {
  hour: Date;
  sold: number;
  baseline: number;
  multiplier: number;
};

export type PostSpikeMatch = {
  postId: string;
  publishedAt: Date;
  spike: SalesSpike;
  hoursAfterPost: number;
  /** Estimated tickets attributable to the spike (spike - baseline) */
  estimatedLift: number;
};

/**
 * Load hourly ticket sales for an edition within a date range.
 */
export async function loadHourlySales(
  editionId: string,
  fromDay: string,
  toDay: string,
): Promise<HourlySales[]> {
  const db = getDb();

  const fromDate = new Date(`${fromDay}T00:00:00+02:00`);
  const toDate = new Date(`${toDay}T23:59:59+02:00`);

  const rows = await db
    .select({
      hour: sql<Date>`date_trunc('hour', ${ticketSales.soldAt} AT TIME ZONE 'Europe/Amsterdam')`.as(
        "hour",
      ),
      sold: sql<number>`sum(${ticketSales.quantity})`.as("sold"),
    })
    .from(ticketSales)
    .where(
      and(
        eq(ticketSales.editionId, editionId),
        gte(ticketSales.soldAt, fromDate),
        lte(ticketSales.soldAt, toDate),
      ),
    )
    .groupBy(
      sql`date_trunc('hour', ${ticketSales.soldAt} AT TIME ZONE 'Europe/Amsterdam')`,
    )
    .orderBy(
      sql`date_trunc('hour', ${ticketSales.soldAt} AT TIME ZONE 'Europe/Amsterdam')`,
    );

  return rows.map((r) => ({
    hour: new Date(r.hour),
    sold: Number(r.sold),
  }));
}

/**
 * Fill gaps in hourly data with zeros for continuous analysis.
 */
function fillHourlyGaps(sales: HourlySales[], fromDay: string, toDay: string): HourlySales[] {
  if (sales.length === 0) return [];

  const salesMap = new Map<string, number>();
  for (const s of sales) {
    salesMap.set(s.hour.toISOString(), s.sold);
  }

  const result: HourlySales[] = [];
  const start = new Date(`${fromDay}T00:00:00+02:00`);
  const end = new Date(`${toDay}T23:59:59+02:00`);

  for (let h = new Date(start); h <= end; h.setHours(h.getHours() + 1)) {
    const key = h.toISOString();
    result.push({
      hour: new Date(h),
      sold: salesMap.get(key) ?? 0,
    });
  }

  return result;
}

/**
 * Calculate rolling baseline (average sales per hour over past N hours).
 */
function calculateBaseline(
  sales: HourlySales[],
  index: number,
  windowHours: number = BASELINE_WINDOW_HOURS,
): number {
  const start = Math.max(0, index - windowHours);
  const window = sales.slice(start, index);
  if (window.length === 0) return 0;

  const total = window.reduce((sum, h) => sum + h.sold, 0);
  return total / window.length;
}

/**
 * Detect spikes in hourly sales data.
 */
export function detectSpikes(sales: HourlySales[]): SalesSpike[] {
  const spikes: SalesSpike[] = [];

  for (let i = BASELINE_WINDOW_HOURS; i < sales.length; i++) {
    const hour = sales[i]!;
    const baseline = calculateBaseline(sales, i);

    // Skip if baseline is too low to be meaningful
    if (baseline < 0.5) continue;

    const multiplier = hour.sold / baseline;

    if (hour.sold >= MIN_SPIKE_SIZE && multiplier >= SPIKE_MULTIPLIER) {
      spikes.push({
        hour: hour.hour,
        sold: hour.sold,
        baseline,
        multiplier,
      });
    }
  }

  return spikes;
}

/**
 * Match detected spikes to posts published within the lookback window.
 */
export function matchSpikesToPosts(
  spikes: SalesSpike[],
  posts: Array<{ postId: string; publishedAt: Date | string | null }>,
): PostSpikeMatch[] {
  const matches: PostSpikeMatch[] = [];

  for (const spike of spikes) {
    const spikeTime = spike.hour.getTime();

    for (const post of posts) {
      if (!post.publishedAt) continue;

      const publishedTime =
        typeof post.publishedAt === "string"
          ? new Date(post.publishedAt).getTime()
          : post.publishedAt.getTime();

      const hoursAfter = (spikeTime - publishedTime) / (1000 * 60 * 60);

      // Spike must be 0-4 hours AFTER the post
      if (hoursAfter >= 0 && hoursAfter <= POST_WINDOW_HOURS) {
        matches.push({
          postId: post.postId,
          publishedAt: new Date(publishedTime),
          spike,
          hoursAfterPost: Math.round(hoursAfter * 10) / 10,
          estimatedLift: Math.round(spike.sold - spike.baseline),
        });
      }
    }
  }

  // Sort by estimated lift descending
  matches.sort((a, b) => b.estimatedLift - a.estimatedLift);

  return matches;
}

/**
 * Full spike detection pipeline for an event's posts.
 */
export async function detectPostSpikes(
  editionId: string,
  eventDay: string,
  posts: Array<{ postId: string; publishedAt: Date | string | null; salesImpactRole: string }>,
): Promise<{
  spikes: SalesSpike[];
  matches: PostSpikeMatch[];
  hourlySales: HourlySales[];
}> {
  // Only consider promo posts (before event)
  const promoPosts = posts.filter((p) => p.salesImpactRole === "promo" && p.publishedAt);

  if (promoPosts.length === 0) {
    return { spikes: [], matches: [], hourlySales: [] };
  }

  // Find earliest post date to start analysis
  const postDates = promoPosts
    .map((p) => (typeof p.publishedAt === "string" ? p.publishedAt : p.publishedAt?.toISOString()))
    .filter(Boolean) as string[];

  if (postDates.length === 0) {
    return { spikes: [], matches: [], hourlySales: [] };
  }

  const earliestPost = postDates.sort()[0]!;
  const fromDay = amsterdamDay(earliestPost) ?? shiftIsoDay(eventDay, -30);
  const toDay = shiftIsoDay(eventDay, -1); // Up to day before event (exclude event day noise)

  // Load hourly sales
  const rawSales = await loadHourlySales(editionId, fromDay, toDay);
  const hourlySales = fillHourlyGaps(rawSales, fromDay, toDay);

  if (hourlySales.length === 0) {
    return { spikes: [], matches: [], hourlySales: [] };
  }

  // Detect spikes
  const spikes = detectSpikes(hourlySales);

  // Match spikes to posts
  const matches = matchSpikesToPosts(
    spikes,
    promoPosts.map((p) => ({ postId: p.postId, publishedAt: p.publishedAt })),
  );

  return { spikes, matches, hourlySales };
}

export type PostSpikeAttribution = {
  postId: string;
  hasSpike: boolean;
  spikes: Array<{
    hoursAfterPost: number;
    estimatedLift: number;
    spikeMultiplier: number;
  }>;
  /** Total estimated lift from all matched spikes */
  totalEstimatedLift: number;
};

/**
 * Summarize spike matches by post for UI display.
 */
export function summarizeByPost(matches: PostSpikeMatch[]): Map<string, PostSpikeAttribution> {
  const byPost = new Map<string, PostSpikeAttribution>();

  for (const match of matches) {
    let entry = byPost.get(match.postId);
    if (!entry) {
      entry = {
        postId: match.postId,
        hasSpike: false,
        spikes: [],
        totalEstimatedLift: 0,
      };
      byPost.set(match.postId, entry);
    }

    entry.hasSpike = true;
    entry.spikes.push({
      hoursAfterPost: match.hoursAfterPost,
      estimatedLift: match.estimatedLift,
      spikeMultiplier: Math.round(match.spike.multiplier * 10) / 10,
    });
    entry.totalEstimatedLift += match.estimatedLift;
  }

  return byPost;
}
