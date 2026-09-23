import { and, eq, gte, lte, max } from "drizzle-orm";
import { cache } from "react";
import { DASHBOARD_TTL_MS, rememberTtl } from "@/lib/cache/ttl";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  ticketInventoryDaily,
  ticketSalesDaily,
  ticketSalesOnDay,
} from "@/lib/db/schema";
import {
  dailyDeltasFromInventorySnapshots,
  normalizeIsoDay,
} from "@/lib/dashboard/inventory-snapshots";
import { amsterdamDay, formatDayShort, shiftIsoDay } from "@/lib/time/amsterdam";

/** Venue-wide stacked bars; same Weeztix order-histogram as Insights. */
export const DAILY_TICKET_SALES_WINDOW = 30;

type DailyTicketSalesRow = {
  editionId: string;
  name: string;
  startsAt: Date;
  day: string;
  sold: number;
  paidSold?: number;
  freeSold?: number;
  revenueCents?: number;
};

/** High-contrast qualitative palette; adjacent hues stay far apart in the stack. */
const EVENT_COLORS = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#db2777",
  "#eab308",
  "#0891b2",
  "#7c3aed",
  "#dc2626",
  "#65a30d",
  "#c026d3",
  "#0f766e",
  "#b45309",
] as const;

export type DailyTicketSalesEvent = {
  id: string;
  name: string;
  startsAt: string;
  color: string;
};

export type DailyTicketSalesBreakdown = {
  editionId: string;
  sold: number;
  paidSold: number;
  freeSold: number;
  revenueCents: number;
};

export type DailyTicketSalesDay = {
  day: string;
  label: string;
  total: number;
  values: Record<string, number>;
  breakdown: DailyTicketSalesBreakdown[];
};

export type DailyTicketSalesSeries = {
  startDay: string;
  endDay: string;
  windowDays: number;
  windowTotal: number;
  events: DailyTicketSalesEvent[];
  days: DailyTicketSalesDay[];
};

export type DailyTicketSales = DailyTicketSalesSeries & {
  /** Last time Weeztix wrote the rows this chart reads. */
  refreshedAt: string | null;
};

function colorForIndex(index: number): string {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

function emptySeries(endDay: string, windowDays: number): DailyTicketSalesSeries {
  const startDay = shiftIsoDay(endDay, -(windowDays - 1));
  const days: DailyTicketSalesDay[] = [];
  let cursor = startDay;
  while (cursor <= endDay) {
    days.push({
      day: cursor,
      label: formatDayShort(cursor),
      total: 0,
      values: {},
      breakdown: [],
    });
    cursor = shiftIsoDay(cursor, 1);
  }
  return {
    startDay,
    endDay,
    windowDays,
    windowTotal: 0,
    events: [],
    days,
  };
}

function normalizeDay(value: string | Date): string {
  return normalizeIsoDay(value);
}

/**
 * Prefer the Weeztix order histogram per event (full onsale window).
 * Snapshot / ticketCountToday rows only fill events with no histogram,
 * plus today when the histogram has not caught up yet.
 */
export function mergeDailyTicketSalesRows(input: {
  endDay: string;
  orderRows: DailyTicketSalesRow[];
  snapshotRows: DailyTicketSalesRow[];
}): DailyTicketSalesRow[] {
  const orderEditionIds = new Set(
    input.orderRows.map((row) => row.editionId),
  );
  const orderKeys = new Set(
    input.orderRows.map(
      (row) => `${row.editionId}:${normalizeDay(row.day)}`,
    ),
  );
  const fallback = input.snapshotRows.filter((row) => {
    const day = normalizeDay(row.day);
    if (!day || orderKeys.has(`${row.editionId}:${day}`)) return false;
    if (!orderEditionIds.has(row.editionId)) return true;
    return day === input.endDay;
  });
  return [...input.orderRows, ...fallback];
}

export function buildDailyTicketSales(input: {
  endDay: string;
  windowDays: number;
  rows: DailyTicketSalesRow[];
}): DailyTicketSalesSeries {
  const windowDays = Math.max(1, input.windowDays);
  const startDay = shiftIsoDay(input.endDay, -(windowDays - 1));
  const byEdition = new Map<
    string,
    {
      name: string;
      startsAt: Date;
      byDay: Map<
        string,
        { sold: number; paidSold: number; freeSold: number; revenueCents: number }
      >;
    }
  >();

  for (const row of input.rows) {
    if (/TEMPLATE/i.test(row.name) || row.sold <= 0) continue;
    const day = normalizeDay(row.day);
    if (!day || day < startDay || day > input.endDay) continue;
    const current = byEdition.get(row.editionId) ?? {
      name: row.name,
      startsAt: row.startsAt,
      byDay: new Map(),
    };
    const prev = current.byDay.get(day) ?? {
      sold: 0,
      paidSold: 0,
      freeSold: 0,
      revenueCents: 0,
    };
    current.byDay.set(day, {
      sold: prev.sold + row.sold,
      paidSold: prev.paidSold + (row.paidSold ?? 0),
      freeSold: prev.freeSold + (row.freeSold ?? 0),
      revenueCents: prev.revenueCents + (row.revenueCents ?? 0),
    });
    byEdition.set(row.editionId, current);
  }

  const events: DailyTicketSalesEvent[] = [...byEdition.entries()]
    .map(([id, meta]) => ({
      id,
      name: meta.name,
      startsAt: meta.startsAt.toISOString(),
    }))
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )
    .map((event, index) => ({
      ...event,
      color: colorForIndex(index),
    }));

  const days: DailyTicketSalesDay[] = [];
  let cursor = startDay;
  let windowTotal = 0;

  while (cursor <= input.endDay) {
    const values: Record<string, number> = {};
    const breakdown: DailyTicketSalesBreakdown[] = [];
    let total = 0;

    for (const event of events) {
      const cell = byEdition.get(event.id)?.byDay.get(cursor);
      const sold = cell?.sold ?? 0;
      values[event.id] = sold;
      if (sold > 0) {
        breakdown.push({
          editionId: event.id,
          sold,
          paidSold: cell?.paidSold ?? 0,
          freeSold: cell?.freeSold ?? 0,
          revenueCents: cell?.revenueCents ?? 0,
        });
      }
      total += sold;
    }

    breakdown.sort((a, b) => b.sold - a.sold);
    windowTotal += total;
    days.push({
      day: cursor,
      label: formatDayShort(cursor),
      total,
      values,
      breakdown,
    });
    cursor = shiftIsoDay(cursor, 1);
  }

  return {
    startDay,
    endDay: input.endDay,
    windowDays,
    windowTotal,
    events,
    days,
  };
}

function asTime(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === "string") {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

/** Newest sync stamp among the tables that feed the sales-per-day chart. */
export async function latestDailyTicketSalesRefreshAt(): Promise<string | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const [orders, onDay, inventory] = await Promise.all([
    db.select({ at: max(ticketSalesDaily.syncedAt) }).from(ticketSalesDaily),
    db.select({ at: max(ticketSalesOnDay.syncedAt) }).from(ticketSalesOnDay),
    db
      .select({ at: max(ticketInventoryDaily.syncedAt) })
      .from(ticketInventoryDaily),
  ]);
  const times = [orders[0]?.at, onDay[0]?.at, inventory[0]?.at]
    .map(asTime)
    .filter((time): time is number => time != null);
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

/**
 * Pull live Weeztix totals for events still on sale and write today's snapshot.
 * That is the intra-day update this chart uses between the morning curve sync.
 */
export async function refreshDailyTicketSales(): Promise<{
  ok: boolean;
  refreshedAt: string | null;
  error?: string;
}> {
  const { listOnSaleWeeztixEditions, syncWeeztixSaleDays } = await import(
    "@/lib/integrations/weeztix/daily"
  );
  const { syncWeeztixTicketStatsFromEditions } = await import(
    "@/lib/integrations/weeztix/sync"
  );
  const editionsOnSale = await listOnSaleWeeztixEditions();
  const inventory = await syncWeeztixTicketStatsFromEditions({
    editionIds: editionsOnSale.map((row) => row.id),
    concurrency: 4,
  });
  const saleDays = inventory.ok
    ? await syncWeeztixSaleDays({ limit: 120 }).catch((err) => ({
        ok: false as const,
        errors: [err instanceof Error ? err.message : "Dagverkoop ophalen mislukt"],
      }))
    : null;
  const refreshedAt = await latestDailyTicketSalesRefreshAt();
  const error = !inventory.ok
    ? inventory.errors[0] ?? "Weeztix-sync mislukt"
    : saleDays && !saleDays.ok
      ? saleDays.errors[0] ?? "Dagverkoop ophalen mislukt"
      : undefined;
  return { ok: !error, refreshedAt, error };
}

export const loadDailyTicketSales = cache(
  async (windowDays = DAILY_TICKET_SALES_WINDOW): Promise<DailyTicketSales> => {
    const endDay = amsterdamDay(new Date());
    if (!hasDatabase()) {
      return { ...emptySeries(endDay, windowDays), refreshedAt: null };
    }

    const refreshedAt = await latestDailyTicketSalesRefreshAt();
    const series = await rememberTtl(
      `tickets:daily:${windowDays}:${endDay}:${refreshedAt ?? "none"}`,
      DASHBOARD_TTL_MS,
      () => loadDailyTicketSalesFresh(endDay, windowDays),
    );
    return { ...series, refreshedAt };
  },
);

async function loadDailyTicketSalesFresh(
  endDay: string,
  windowDays: number,
): Promise<DailyTicketSalesSeries> {
    const db = getDb();
    const startDay = shiftIsoDay(endDay, -(windowDays - 1));
    const prevDay = shiftIsoDay(startDay, -1);

    const [orderRows, onDayRows, inventoryRows] = await Promise.all([
      db
        .select({
          editionId: ticketSalesDaily.editionId,
          name: editions.name,
          startsAt: editions.startsAt,
          day: ticketSalesDaily.day,
          sold: ticketSalesDaily.sold,
          revenueCents: ticketSalesDaily.revenueCents,
        })
        .from(ticketSalesDaily)
        .innerJoin(editions, eq(editions.id, ticketSalesDaily.editionId))
        .where(
          and(
            eq(ticketSalesDaily.platform, "weeztix"),
            gte(ticketSalesDaily.day, startDay),
            lte(ticketSalesDaily.day, endDay),
          ),
        ),
      db
        .select({
          editionId: ticketSalesOnDay.editionId,
          name: editions.name,
          startsAt: editions.startsAt,
          day: ticketSalesOnDay.day,
          sold: ticketSalesOnDay.sold,
          paidSold: ticketSalesOnDay.paidSold,
          freeSold: ticketSalesOnDay.freeSold,
          revenueCents: ticketSalesOnDay.revenueCents,
        })
        .from(ticketSalesOnDay)
        .innerJoin(editions, eq(editions.id, ticketSalesOnDay.editionId))
        .where(
          and(
            gte(ticketSalesOnDay.day, startDay),
            lte(ticketSalesOnDay.day, endDay),
          ),
        ),
      db
        .select({
          editionId: ticketInventoryDaily.editionId,
          name: editions.name,
          startsAt: editions.startsAt,
          day: ticketInventoryDaily.day,
          sold: ticketInventoryDaily.sold,
          paidSold: ticketInventoryDaily.paidSold,
          freeSold: ticketInventoryDaily.freeSold,
          revenueCents: ticketInventoryDaily.revenueCents,
        })
        .from(ticketInventoryDaily)
        .innerJoin(editions, eq(editions.id, ticketInventoryDaily.editionId))
        .where(
          and(
            gte(ticketInventoryDaily.day, prevDay),
            lte(ticketInventoryDaily.day, endDay),
          ),
        ),
    ]);

    const onDayKeys = new Set(
      onDayRows.map((row) => `${row.editionId}:${normalizeDay(row.day)}`),
    );
    const editionMeta = new Map<string, { name: string; startsAt: Date }>();
    for (const row of inventoryRows) {
      editionMeta.set(row.editionId, { name: row.name, startsAt: row.startsAt });
    }

    const deltaRows = dailyDeltasFromInventorySnapshots(
      inventoryRows.map((row) => ({
        editionId: row.editionId,
        day: normalizeDay(row.day),
        sold: row.sold,
        paidSold: row.paidSold,
        freeSold: row.freeSold,
        revenueCents: row.revenueCents,
      })),
    )
      .filter((row) => {
        if (row.day < startDay || row.day > endDay || row.sold <= 0) return false;
        return !onDayKeys.has(`${row.editionId}:${row.day}`);
      })
      .flatMap((row) => {
        const meta = editionMeta.get(row.editionId);
        if (!meta) return [];
        return [
          {
            editionId: row.editionId,
            name: meta.name,
            startsAt: meta.startsAt,
            day: row.day,
            sold: row.sold,
            paidSold: row.paidSold,
            freeSold: row.freeSold,
            revenueCents: row.revenueCents,
          },
        ];
      });

    return buildDailyTicketSales({
      endDay,
      windowDays,
      rows: mergeDailyTicketSalesRows({
        endDay,
        orderRows: orderRows.map((row) => ({
          editionId: row.editionId,
          name: row.name,
          startsAt: row.startsAt,
          day: normalizeDay(row.day),
          sold: row.sold,
          revenueCents: row.revenueCents,
        })),
        snapshotRows: [
          ...onDayRows.map((row) => ({
            editionId: row.editionId,
            name: row.name,
            startsAt: row.startsAt,
            day: normalizeDay(row.day),
            sold: row.sold,
            paidSold: row.paidSold,
            freeSold: row.freeSold,
            revenueCents: row.revenueCents,
          })),
          ...deltaRows,
        ],
      }),
    });
}
