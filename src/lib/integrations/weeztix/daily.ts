import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  ticketSaleReferrers,
  ticketSalesDaily,
} from "@/lib/db/schema";
import { getWeeztixEventStatistics } from "@/lib/integrations/weeztix/client";

const BUCKET_MINUTES = 20;
/** Max lookback vanaf eventstart voor timeToBank-buckets (~2 jaar). */
const MAX_LOOKBACK_DAYS = 800;

type DayPoint = { day: string; sold: number };
type ReferrerPoint = { referrer: string; channel: string; orderCount: number };

function amsterdamDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function nestedBuckets(
  node: unknown,
): Array<{ key?: unknown; doc_count?: number }> {
  if (!node || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const stats = obj.statistics;
  if (!stats || typeof stats !== "object") return [];
  const inner = (stats as Record<string, unknown>).statistics;
  const buckets =
    inner && typeof inner === "object"
      ? (inner as Record<string, unknown>).buckets
      : (stats as Record<string, unknown>).buckets;
  return Array.isArray(buckets)
    ? (buckets as Array<{ key?: unknown; doc_count?: number }>)
    : [];
}

export function classifyReferrer(raw: string): string {
  const s = raw.toLowerCase();
  if (!s) return "direct";
  if (/arenametrix|routage|brevo\.com|sendinblue/i.test(s)) return "brevo";
  if (/instagram|l\.instagram/i.test(s)) return "instagram";
  if (/facebook|fb\.com|lm\.facebook/i.test(s)) return "facebook";
  if (/thuishaven\.nl/i.test(s)) return "website";
  if (/weeztix|eventix|queue-it/i.test(s)) return "shop";
  return "other";
}

/**
 * Weeztix `timeToBank` = histogram in minuten vóór eventstart (buckets ~20 min).
 * doc_count ≈ orders — proxy voor dagelijkse verkoop.
 */
export function dailySalesFromStatistics(
  eventStart: Date,
  data: unknown,
): DayPoint[] {
  const root =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const aggs = root?.aggregations;
  const buckets = nestedBuckets(
    aggs && typeof aggs === "object"
      ? (aggs as Record<string, unknown>).timeToBank
      : null,
  );
  const byDay = new Map<string, number>();

  for (const b of buckets) {
    const minutesBefore = Number(b.key);
    const n = typeof b.doc_count === "number" ? b.doc_count : 0;
    if (!Number.isFinite(minutesBefore) || n <= 0) continue;
    const when = new Date(
      eventStart.getTime() - (minutesBefore + BUCKET_MINUTES / 2) * 60_000,
    );
    if (!Number.isFinite(when.getTime())) continue;
    if (
      when.getTime() <
      eventStart.getTime() - MAX_LOOKBACK_DAYS * 86400000
    ) {
      continue;
    }
    if (when.getTime() > eventStart.getTime() + 2 * 86400000) continue;
    const day = amsterdamDay(when);
    byDay.set(day, (byDay.get(day) ?? 0) + n);
  }

  return [...byDay.entries()]
    .map(([day, sold]) => ({ day, sold }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Referrers uit Weeztix statistics — Brevo-klikken via Arenametrix routage. */
export function referrersFromStatistics(data: unknown): ReferrerPoint[] {
  const root =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const aggs = root?.aggregations;
  const buckets = nestedBuckets(
    aggs && typeof aggs === "object"
      ? (aggs as Record<string, unknown>).referrer
      : null,
  );
  return buckets
    .map((b) => {
      const referrer = String(b.key ?? "");
      const orderCount = typeof b.doc_count === "number" ? b.doc_count : 0;
      return {
        referrer: referrer || "(direct)",
        channel: classifyReferrer(referrer),
        orderCount,
      };
    })
    .filter((r) => r.orderCount > 0);
}

export async function syncWeeztixDailySales(options?: {
  limit?: number;
  daysBack?: number;
  /** Optioneel: alleen edities met startsAt in [startsFrom, startsTo] */
  startsFrom?: Date;
  startsTo?: Date;
  concurrency?: number;
}): Promise<{
  ok: boolean;
  attempted: number;
  editionsWithCurve: number;
  daysUpserted: number;
  referrersUpserted: number;
  brevoOrders: number;
  failed: number;
  errors: string[];
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      attempted: 0,
      editionsWithCurve: 0,
      daysUpserted: 0,
      referrersUpserted: 0,
      brevoOrders: 0,
      failed: 0,
      errors: ["DATABASE_URL ontbreekt"],
    };
  }

  const db = getDb();
  const limit = options?.limit ?? 80;
  const daysBack = options?.daysBack ?? 400;
  const concurrency = Math.max(1, options?.concurrency ?? 3);
  const from =
    options?.startsFrom ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - daysBack);
      return d;
    })();
  const to =
    options?.startsTo ??
    (() => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d;
    })();

  const rows = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
      guid: editions.weeztixEventId,
    })
    .from(editions)
    .where(
      and(
        isNotNull(editions.weeztixEventId),
        gte(editions.startsAt, from),
        lte(editions.startsAt, to),
      ),
    )
    .orderBy(desc(editions.startsAt))
    .limit(limit);

  let editionsWithCurve = 0;
  let daysUpserted = 0;
  let referrersUpserted = 0;
  let brevoOrders = 0;
  let failed = 0;
  const errors: string[] = [];

  async function one(row: (typeof rows)[number]) {
    const guid = row.guid;
    if (!guid) return;
    const stats = await getWeeztixEventStatistics(guid);
    if (!stats.ok) {
      failed += 1;
      if (errors.length < 12) errors.push(`${guid.slice(0, 8)}: ${stats.error}`);
      return;
    }
    const points = dailySalesFromStatistics(row.startsAt, stats.data);
    if (points.length > 0) {
      editionsWithCurve += 1;
      for (const p of points) {
        await db
          .insert(ticketSalesDaily)
          .values({
            editionId: row.id,
            platform: "weeztix",
            day: p.day,
            sold: p.sold,
            revenueCents: 0,
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              ticketSalesDaily.editionId,
              ticketSalesDaily.platform,
              ticketSalesDaily.day,
            ],
            set: {
              sold: p.sold,
              syncedAt: new Date(),
            },
          });
        daysUpserted += 1;
      }
    }

    const refs = referrersFromStatistics(stats.data);
    for (const r of refs) {
      await db
        .insert(ticketSaleReferrers)
        .values({
          editionId: row.id,
          platform: "weeztix",
          referrer: r.referrer.slice(0, 500),
          channel: r.channel,
          orderCount: r.orderCount,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            ticketSaleReferrers.editionId,
            ticketSaleReferrers.platform,
            ticketSaleReferrers.referrer,
          ],
          set: {
            channel: r.channel,
            orderCount: r.orderCount,
            syncedAt: new Date(),
          },
        });
      referrersUpserted += 1;
      if (r.channel === "brevo") brevoOrders += r.orderCount;
    }
  }

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    await Promise.all(batch.map((r) => one(r)));
  }

  return {
    ok: failed === 0 || editionsWithCurve > 0 || referrersUpserted > 0,
    attempted: rows.length,
    editionsWithCurve,
    daysUpserted,
    referrersUpserted,
    brevoOrders,
    failed,
    errors,
  };
}

export async function recentDailyCurves(limitEditions = 3): Promise<
  Array<{ name: string; startsAt: string; points: DayPoint[]; total: number }>
> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const eds = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
    })
    .from(editions)
    .innerJoin(
      ticketSalesDaily,
      eq(ticketSalesDaily.editionId, editions.id),
    )
    .groupBy(editions.id, editions.name, editions.startsAt)
    .orderBy(desc(editions.startsAt))
    .limit(limitEditions);

  const out: Array<{
    name: string;
    startsAt: string;
    points: DayPoint[];
    total: number;
  }> = [];

  for (const e of eds) {
    const days = await db
      .select({
        day: ticketSalesDaily.day,
        sold: ticketSalesDaily.sold,
      })
      .from(ticketSalesDaily)
      .where(
        and(
          eq(ticketSalesDaily.editionId, e.id),
          eq(ticketSalesDaily.platform, "weeztix"),
        ),
      )
      .orderBy(ticketSalesDaily.day);
    const points = days.map((d) => ({
      day: String(d.day).slice(0, 10),
      sold: d.sold,
    }));
    out.push({
      name: e.name,
      startsAt: e.startsAt.toISOString(),
      points,
      total: points.reduce((s, p) => s + p.sold, 0),
    });
  }
  return out;
}
