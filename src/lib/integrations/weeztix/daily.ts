import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketSalesDaily } from "@/lib/db/schema";
import { getWeeztixEventStatistics } from "@/lib/integrations/weeztix/client";

const BUCKET_MINUTES = 20;

type DayPoint = { day: string; sold: number };

function amsterdamDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function nestedBuckets(node: unknown): Array<{ key?: unknown; doc_count?: number }> {
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

/**
 * Weeztix `timeToBank` is een histogram in minuten t.o.v. eventstart (buckets van 20 min).
 * doc_count ≈ orders in die bucket — proxy voor dagelijkse verkoopsnelheid.
 */
export function dailySalesFromStatistics(
  eventStart: Date,
  data: unknown,
): DayPoint[] {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const aggs = root?.aggregations;
  const buckets = nestedBuckets(aggs && typeof aggs === "object" ? (aggs as Record<string, unknown>).timeToBank : null);
  const byDay = new Map<string, number>();

  for (const b of buckets) {
    const minutesBefore = Number(b.key);
    const n = typeof b.doc_count === "number" ? b.doc_count : 0;
    if (!Number.isFinite(minutesBefore) || n <= 0) continue;
    const when = new Date(
      eventStart.getTime() - (minutesBefore + BUCKET_MINUTES / 2) * 60_000,
    );
    if (!Number.isFinite(when.getTime())) continue;
    if (when.getTime() < eventStart.getTime() - 400 * 86400000) continue;
    if (when.getTime() > eventStart.getTime() + 2 * 86400000) continue;
    const day = amsterdamDay(when);
    byDay.set(day, (byDay.get(day) ?? 0) + n);
  }

  return [...byDay.entries()]
    .map(([day, sold]) => ({ day, sold }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export async function syncWeeztixDailySales(options?: {
  limit?: number;
  daysBack?: number;
  concurrency?: number;
}): Promise<{
  ok: boolean;
  attempted: number;
  editionsWithCurve: number;
  daysUpserted: number;
  failed: number;
  errors: string[];
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      attempted: 0,
      editionsWithCurve: 0,
      daysUpserted: 0,
      failed: 0,
      errors: ["DATABASE_URL ontbreekt"],
    };
  }

  const db = getDb();
  const limit = options?.limit ?? 80;
  const daysBack = options?.daysBack ?? 400;
  const concurrency = Math.max(1, options?.concurrency ?? 3);
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - daysBack);
  const to = new Date();
  to.setUTCFullYear(to.getUTCFullYear() + 1);

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
    if (points.length === 0) return;
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

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    await Promise.all(batch.map((r) => one(r)));
  }

  return {
    ok: failed === 0 || editionsWithCurve > 0,
    attempted: rows.length,
    editionsWithCurve,
    daysUpserted,
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
      day: String(d.day),
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
