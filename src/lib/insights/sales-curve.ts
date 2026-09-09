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
