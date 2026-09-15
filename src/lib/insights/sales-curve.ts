import { formatDayShort, shiftIsoDay } from "@/lib/time/amsterdam";

export type SalesDayPoint = {
  day: string;
  sold: number;
};

export type SalesCurvePoint = {
  day: string;
  label: string;
  sold: number;
  cumulative: number;
  isEvent: boolean;
};

/** Continuous daily series from first sale through the event (zeros on quiet days). */
export function buildSalesCurveSeries(
  points: SalesDayPoint[],
  eventDay: string,
): SalesCurvePoint[] {
  const byDay = new Map<string, number>();
  for (const point of points) {
    const day = point.day.slice(0, 10);
    if (!day || point.sold <= 0) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + point.sold);
  }
  if (byDay.size === 0) return [];

  const days = [...byDay.keys()].sort();
  const start = days[0]!;
  const lastSale = days[days.length - 1]!;
  const gapToEvent =
    eventDay && eventDay > lastSale
      ? Math.round(
          (Date.parse(`${eventDay}T12:00:00.000Z`) -
            Date.parse(`${lastSale}T12:00:00.000Z`)) /
            86_400_000,
        )
      : 0;
  const end =
    eventDay && eventDay > lastSale && gapToEvent <= 21 ? eventDay : lastSale;

  const series: SalesCurvePoint[] = [];
  let cumulative = 0;
  let cursor = start;
  while (cursor <= end) {
    const sold = byDay.get(cursor) ?? 0;
    cumulative += sold;
    series.push({
      day: cursor,
      label: formatDayShort(cursor),
      sold,
      cumulative,
      isEvent: cursor === eventDay,
    });
    cursor = shiftIsoDay(cursor, 1);
  }
  return series;
}

export function sumSalesDays(points: SalesDayPoint[]): number {
  return points.reduce((sum, point) => sum + Math.max(0, Number(point.sold) || 0), 0);
}

function daySpan(points: SalesDayPoint[]): number {
  if (points.length === 0) return 0;
  const days = points.map((point) => point.day.slice(0, 10)).sort();
  const first = Date.parse(`${days[0]}T12:00:00.000Z`);
  const last = Date.parse(`${days[days.length - 1]}T12:00:00.000Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return Math.max(0, Math.round((last - first) / 86_400_000));
}

/**
 * Prefer the Weeztix order histogram (first sale → event).
 * Snapshot deltas only cover days after inventory snapshots started — never
 * plot those as the full curve when they explain little of sold.
 */
export function preferCompleteSalesCurve(input: {
  sold: number;
  orderDays: SalesDayPoint[];
  snapshotDays: SalesDayPoint[];
}): { points: SalesDayPoint[]; source: "orders" | "snapshots" } {
  const orderSum = sumSalesDays(input.orderDays);
  const snapshotSum = sumSalesDays(input.snapshotDays);
  const sold = Math.max(0, input.sold);
  const orderSpan = daySpan(input.orderDays);
  const snapshotSpan = daySpan(input.snapshotDays);
  const snapshotIsStub = sold > 0 && snapshotSum < sold * 0.25;
  const ordersLookLikeOnsale =
    input.orderDays.length >= 2 &&
    (orderSum >= sold * 0.3 ||
      orderSpan >= 14 ||
      (orderSum >= snapshotSum && orderSpan > snapshotSpan + 2));

  if (ordersLookLikeOnsale) {
    return { points: input.orderDays, source: "orders" };
  }
  if (snapshotIsStub) {
    if (input.orderDays.length > 0 && orderSum >= snapshotSum) {
      return { points: input.orderDays, source: "orders" };
    }
    return { points: [], source: "snapshots" };
  }
  return { points: input.snapshotDays, source: "snapshots" };
}
