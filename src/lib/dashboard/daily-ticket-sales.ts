import { and, eq, gte, lte } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  ticketInventoryDaily,
  ticketSalesOnDay,
} from "@/lib/db/schema";
import {
  dailyDeltasFromInventorySnapshots,
  normalizeIsoDay,
} from "@/lib/dashboard/inventory-snapshots";
import { amsterdamDay, formatDayShort, shiftIsoDay } from "@/lib/time/amsterdam";

export const DAILY_TICKET_SALES_WINDOW = 14;

const EVENT_COLORS = [
  "#1d4e89",
  "#4a90c4",
  "#2a9d8f",
  "#c9a227",
  "#e07a3d",
  "#c44b3c",
  "#6d597a",
  "#355070",
  "#b56576",
  "#3d7a5f",
  "#5b8fa8",
  "#8a6d3b",
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

export type DailyTicketSales = {
  startDay: string;
  endDay: string;
  windowDays: number;
  windowTotal: number;
  events: DailyTicketSalesEvent[];
  days: DailyTicketSalesDay[];
};

function colorForEdition(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}

function emptySeries(endDay: string, windowDays: number): DailyTicketSales {
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

export function buildDailyTicketSales(input: {
  endDay: string;
  windowDays: number;
  rows: Array<{
    editionId: string;
    name: string;
    startsAt: Date;
    day: string;
    sold: number;
    paidSold?: number;
    freeSold?: number;
    revenueCents?: number;
  }>;
}): DailyTicketSales {
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
      color: colorForEdition(id),
    }))
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

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

export const loadDailyTicketSales = cache(
  async (windowDays = DAILY_TICKET_SALES_WINDOW): Promise<DailyTicketSales> => {
    const endDay = amsterdamDay(new Date());
    if (!hasDatabase()) return emptySeries(endDay, windowDays);

    const db = getDb();
    const startDay = shiftIsoDay(endDay, -(windowDays - 1));
    const prevDay = shiftIsoDay(startDay, -1);

    const [onDayRows, inventoryRows] = await Promise.all([
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
      rows: [
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
    });
  },
);
