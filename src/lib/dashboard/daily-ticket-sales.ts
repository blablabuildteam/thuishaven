import { and, eq, gte, lte, max } from "drizzle-orm";
import { cache } from "react";
import { DASHBOARD_TTL_MS, rememberTtl } from "@/lib/cache/ttl";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  editions,
  syncJobs,
  ticketInventory,
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
} & DailyTicketSalesSyncState;

/**
 * Whether a full live pull finished, and whether one is running now. Kept
 * apart from `refreshedAt`: the stock totals land a few seconds into a pull,
 * the order histogram (today's number) only at the end, so the newest table
 * stamp says "fresh" long before today's bar is.
 */
export type DailyTicketSalesSyncState = {
  /** End of the last full pull that succeeded. */
  completedAt: string | null;
  /** Start of a pull that is still running, if any. */
  runningSince: string | null;
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
 * The Weeztix order histogram is authoritative per event and per day, today
 * included: it buckets orders by calendar day exactly like Weeztix's own
 * dashboard, so it is the number to match.
 *
 * It is NOT reconstructed from the live running total. `ticketInventory.sold`
 * is a cumulative `sold_count` snapshot whose day-over-day delta drifts from the
 * calendar day — the last pre-midnight snapshot runs at ~23:00, so late-evening
 * sales leak into "today" (ADE Friday read 8 vs the histogram's 6, Cynthia 6
 * vs 2), and `inventory.sold − histogramBefore` additionally dumped the chronic
 * free/guest-ticket gap onto today as phantom sales on events that sold nothing.
 *
 * Snapshot deltas only stand in for whole events that have no order histogram
 * at all. They include yesterday evening, so they must not replace a day the
 * histogram already covers.
 */
export function mergeDailyTicketSalesRows(input: {
  orderRows: DailyTicketSalesRow[];
  snapshotRows: DailyTicketSalesRow[];
}): DailyTicketSalesRow[] {
  const orderEditionIds = new Set(
    input.orderRows.map((row) => row.editionId),
  );
  const orderByKey = new Map<string, DailyTicketSalesRow>();
  for (const row of input.orderRows) {
    const day = normalizeDay(row.day);
    if (day) orderByKey.set(`${row.editionId}:${day}`, row);
  }

  const extra: DailyTicketSalesRow[] = [];
  for (const row of input.snapshotRows) {
    const day = normalizeDay(row.day);
    if (!day) continue;
    if (orderEditionIds.has(row.editionId)) continue;
    if (orderByKey.has(`${row.editionId}:${day}`)) continue;
    extra.push(row);
  }

  return [...orderByKey.values(), ...extra];
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

const SYNC_JOB_SOURCE = "weeztix:daily-ticket-sales";

/**
 * A pull never outlives the route's maxDuration (300s). A "running" row older
 * than this is a crashed or timed-out function, not a live pull.
 */
const SYNC_RUNNING_MAX_MS = 5 * 60 * 1000;

export async function dailyTicketSalesSyncState(): Promise<DailyTicketSalesSyncState> {
  if (!hasDatabase()) return { completedAt: null, runningSince: null };
  const db = getDb();
  const runningAfter = new Date(Date.now() - SYNC_RUNNING_MAX_MS);
  const [done, running] = await Promise.all([
    db
      .select({ at: max(syncJobs.finishedAt) })
      .from(syncJobs)
      .where(and(eq(syncJobs.source, SYNC_JOB_SOURCE), eq(syncJobs.status, "ok"))),
    db
      .select({ at: max(syncJobs.startedAt) })
      .from(syncJobs)
      .where(
        and(
          eq(syncJobs.source, SYNC_JOB_SOURCE),
          eq(syncJobs.status, "running"),
          gte(syncJobs.startedAt, runningAfter),
        ),
      ),
  ]);
  const iso = (value: unknown) => {
    const time = asTime(value);
    return time == null ? null : new Date(time).toISOString();
  };
  return { completedAt: iso(done[0]?.at), runningSince: iso(running[0]?.at) };
}

/** Marks a pull as running; the returned callback closes it. Never throws. */
async function startSyncJob(): Promise<
  (result: { ok: boolean; error?: string }) => Promise<string>
> {
  const db = getDb();
  const id = await db
    .insert(syncJobs)
    .values({ source: SYNC_JOB_SOURCE, status: "running", startedAt: new Date() })
    .returning({ id: syncJobs.id })
    .then((rows) => rows[0]?.id ?? null)
    .catch(() => null);
  return async ({ ok, error }) => {
    const finishedAt = new Date();
    if (id) {
      await db
        .update(syncJobs)
        .set({ status: ok ? "ok" : "failed", finishedAt, error: error ?? null })
        .where(eq(syncJobs.id, id))
        .catch(() => undefined);
    }
    return finishedAt.toISOString();
  };
}

/** Newest sync stamp among the tables that feed the sales-per-day chart. */
export async function latestDailyTicketSalesRefreshAt(): Promise<string | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const [orders, onDay, inventory, running] = await Promise.all([
    db.select({ at: max(ticketSalesDaily.syncedAt) }).from(ticketSalesDaily),
    db.select({ at: max(ticketSalesOnDay.syncedAt) }).from(ticketSalesOnDay),
    db
      .select({ at: max(ticketInventoryDaily.syncedAt) })
      .from(ticketInventoryDaily),
    db
      .select({ at: max(ticketInventory.syncedAt) })
      .from(ticketInventory)
      .where(eq(ticketInventory.platform, "weeztix")),
  ]);
  const times = [orders[0]?.at, onDay[0]?.at, inventory[0]?.at, running[0]?.at]
    .map(asTime)
    .filter((time): time is number => time != null);
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

/**
 * Pull live Weeztix totals for events still on sale, write today's snapshot
 * and re-pull their order curve, so both this chart and the sales curve show
 * the stand of right now instead of the last cron slot.
 */
export type DailyTicketSalesRefreshStep = "inventory" | "saleDays" | "curves";

export type DailyTicketSalesRefreshProgress = {
  step: DailyTicketSalesRefreshStep;
  /** Events finished in this step. */
  done: number;
  /** Events this step works through. */
  total: number;
  /** 0–1 across all steps, weighted by how long each step usually takes. */
  fraction: number;
};

/**
 * Rough share of the wall-clock time per step (measured Nov 2026 with 19
 * events: ~8s totals, ~58s sale days, ~6s order curve), so the bar moves at
 * an even pace instead of racing through the fast steps.
 */
const REFRESH_STEP_WEIGHTS: Record<DailyTicketSalesRefreshStep, number> = {
  inventory: 1,
  saleDays: 6,
  curves: 1,
};
const REFRESH_STEP_ORDER: DailyTicketSalesRefreshStep[] = [
  "inventory",
  "saleDays",
  "curves",
];

function refreshProgress(
  step: DailyTicketSalesRefreshStep,
  done: number,
  total: number,
): DailyTicketSalesRefreshProgress {
  const sum = REFRESH_STEP_ORDER.reduce((s, k) => s + REFRESH_STEP_WEIGHTS[k], 0);
  let before = 0;
  for (const k of REFRESH_STEP_ORDER) {
    if (k === step) break;
    before += REFRESH_STEP_WEIGHTS[k];
  }
  const within = total > 0 ? Math.min(1, done / total) : 1;
  return {
    step,
    done,
    total,
    fraction: (before + within * REFRESH_STEP_WEIGHTS[step]) / sum,
  };
}

export async function refreshDailyTicketSales(options?: {
  onProgress?: (progress: DailyTicketSalesRefreshProgress) => void;
}): Promise<{
  ok: boolean;
  /** When this pull finished; what "Bijgewerkt" shows. */
  refreshedAt: string | null;
  error?: string;
}> {
  const finish = await startSyncJob();
  try {
    const result = await runDailyTicketSalesRefresh(options);
    const finishedAt = await finish(result);
    return { ...result, refreshedAt: result.ok ? finishedAt : null };
  } catch (err) {
    await finish({
      ok: false,
      error: err instanceof Error ? err.message : "Verversen mislukt",
    });
    throw err;
  }
}

async function runDailyTicketSalesRefresh(options?: {
  onProgress?: (progress: DailyTicketSalesRefreshProgress) => void;
}): Promise<{ ok: boolean; error?: string }> {
  const report = (step: DailyTicketSalesRefreshStep) =>
    options?.onProgress
      ? (done: number, total: number) =>
          options.onProgress?.(refreshProgress(step, done, total))
      : undefined;
  const {
    listOnSaleWeeztixEditions,
    syncWeeztixOnSaleCurves,
    syncWeeztixSaleDays,
  } = await import("@/lib/integrations/weeztix/daily");
  const { syncWeeztixTicketStatsFromEditions } = await import(
    "@/lib/integrations/weeztix/sync"
  );
  const editionsOnSale = await listOnSaleWeeztixEditions();
  const onSaleIds = editionsOnSale.map((row) => row.id);
  const inventory = await syncWeeztixTicketStatsFromEditions({
    editionIds: onSaleIds,
    concurrency: 4,
    onProgress: report("inventory"),
  });
  const saleDays = inventory.ok
    ? await syncWeeztixSaleDays({
        limit: 120,
        onProgress: report("saleDays"),
      }).catch((err) => ({
        ok: false as const,
        errors: [err instanceof Error ? err.message : "Dagverkoop ophalen mislukt"],
      }))
    : null;
  /**
   * The order histogram is what both this chart and the sales curve read for
   * past days, so refreshing stats alone leaves today stuck on the last cron
   * value. Pull the curve for the same events.
   */
  const curves = inventory.ok
    ? await syncWeeztixOnSaleCurves({ onProgress: report("curves") }).catch(
        (err) => ({
          ok: false as const,
          errors: [
            err instanceof Error ? err.message : "Verkoopverloop ophalen mislukt",
          ],
        }),
      )
    : null;
  const error = !inventory.ok
    ? inventory.errors[0] ?? "Weeztix-sync mislukt"
    : saleDays && !saleDays.ok
      ? saleDays.errors[0] ?? "Dagverkoop ophalen mislukt"
      : curves && !curves.ok
        ? curves.errors[0] ?? "Verkoopverloop ophalen mislukt"
        : undefined;
  return { ok: !error, error };
}

/**
 * Live Weeztix totals and order curve for one edition. Used from Insights
 * when someone wants this event's stand before the next cron slot.
 */
export async function refreshEditionTicketSales(editionId: string): Promise<{
  ok: boolean;
  refreshedAt: string | null;
  error?: string;
}> {
  if (!hasDatabase()) {
    return { ok: false, refreshedAt: null, error: "DATABASE_URL ontbreekt" };
  }
  const db = getDb();
  const [edition] = await db
    .select({
      id: editions.id,
      weeztixEventId: editions.weeztixEventId,
    })
    .from(editions)
    .where(eq(editions.id, editionId))
    .limit(1);
  if (!edition?.weeztixEventId) {
    return { ok: false, refreshedAt: null, error: "Geen Weeztix-event" };
  }

  const { snapshotWeeztixInventoryToday, syncWeeztixDailySales } = await import(
    "@/lib/integrations/weeztix/daily"
  );
  const { syncWeeztixTicketStatsFromEditions } = await import(
    "@/lib/integrations/weeztix/sync"
  );

  const inventory = await syncWeeztixTicketStatsFromEditions({
    editionIds: [editionId],
    concurrency: 1,
  });
  const curves = inventory.ok
    ? await syncWeeztixDailySales({
        editionIds: [editionId],
        curvesOnly: true,
        limit: 1,
        concurrency: 1,
      }).catch((err) => ({
        ok: false as const,
        errors: [
          err instanceof Error ? err.message : "Verkoopverloop ophalen mislukt",
        ],
      }))
    : null;
  if (inventory.ok) {
    await snapshotWeeztixInventoryToday([editionId]);
  }

  const refreshedAt = new Date().toISOString();
  const error = !inventory.ok
    ? inventory.errors[0] ?? "Weeztix-sync mislukt"
    : curves && !curves.ok
      ? curves.errors[0] ?? "Verkoopverloop ophalen mislukt"
      : undefined;
  return { ok: !error, refreshedAt: error ? null : refreshedAt, error };
}

export const loadDailyTicketSales = cache(
  async (windowDays = DAILY_TICKET_SALES_WINDOW): Promise<DailyTicketSales> => {
    const endDay = amsterdamDay(new Date());
    if (!hasDatabase()) {
      return {
        ...emptySeries(endDay, windowDays),
        refreshedAt: null,
        completedAt: null,
        runningSince: null,
      };
    }

    const [refreshedAt, syncState] = await Promise.all([
      latestDailyTicketSalesRefreshAt(),
      dailyTicketSalesSyncState(),
    ]);
    const series = await rememberTtl(
      `tickets:daily:v3:${windowDays}:${endDay}:${refreshedAt ?? "none"}`,
      DASHBOARD_TTL_MS,
      () => loadDailyTicketSalesFresh(endDay, windowDays),
    );
    // Sync state stays outside the TTL cache: it changes without the data.
    return { ...series, refreshedAt, ...syncState };
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
