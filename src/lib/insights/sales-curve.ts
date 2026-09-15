import { amsterdamDay, formatDayShort, shiftIsoDay } from "@/lib/time/amsterdam";

export type SalesDayPoint = {
  day: string;
  sold: number;
};

export type SalesCurveActivity = {
  kind: "social" | "mail";
  channel: string;
  title: string;
};

export type SalesCurvePoint = {
  day: string;
  label: string;
  sold: number;
  cumulative: number;
  isEvent: boolean;
  activities: SalesCurveActivity[];
};

/** Continuous daily series from first sale through the event (zeros on quiet days). */
export function buildSalesCurveSeries(
  points: SalesDayPoint[],
  eventDay: string,
  extraDays: string[] = [],
): SalesCurvePoint[] {
  const byDay = new Map<string, number>();
  for (const point of points) {
    const day = point.day.slice(0, 10);
    if (!day || point.sold <= 0) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + point.sold);
  }
  if (byDay.size === 0) return [];

  const days = [...byDay.keys()].sort();
  const firstSale = days[0]!;
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

  const activityDays = extraDays
    .map((day) => day.slice(0, 10))
    .filter((day) => day && (!eventDay || day <= eventDay))
    .sort();
  const earliestActivity = activityDays[0];
  const lookbackFloor = shiftIsoDay(firstSale, -90);
  const start =
    earliestActivity && earliestActivity < firstSale
      ? earliestActivity < lookbackFloor
        ? lookbackFloor
        : earliestActivity
      : firstSale;

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
      activities: [],
    });
    cursor = shiftIsoDay(cursor, 1);
  }
  return series;
}

export function marketingActivitiesByDay(input: {
  posts: Array<{
    publishedAt: string | null;
    channel: string;
    title: string | null;
    variants?: Array<{ publishedAt: string | null; title: string | null }>;
  }>;
  mails: Array<{ sentAt: string | null; name: string }>;
}): Map<string, SalesCurveActivity[]> {
  const byDay = new Map<string, SalesCurveActivity[]>();

  function push(day: string, activity: SalesCurveActivity) {
    if (!day) return;
    const list = byDay.get(day) ?? [];
    list.push(activity);
    byDay.set(day, list);
  }

  for (const post of input.posts) {
    const rows =
      post.variants && post.variants.length > 0
        ? post.variants.map((variant) => ({
            publishedAt: variant.publishedAt,
            title: variant.title ?? post.title,
          }))
        : [{ publishedAt: post.publishedAt, title: post.title }];
    for (const row of rows) {
      if (!row.publishedAt) continue;
      const day = amsterdamDay(row.publishedAt);
      const title = row.title?.trim() || "Social post";
      push(day, { kind: "social", channel: post.channel, title });
    }
  }
  for (const mail of input.mails) {
    if (!mail.sentAt) continue;
    const day = amsterdamDay(mail.sentAt);
    const title = mail.name?.trim() || "Mailing";
    push(day, { kind: "mail", channel: "mail", title });
  }
  return byDay;
}

export function applyActivitiesToSeries(
  series: SalesCurvePoint[],
  byDay: Map<string, SalesCurveActivity[]>,
): SalesCurvePoint[] {
  if (byDay.size === 0) return series;
  return series.map((row) => ({
    ...row,
    activities: byDay.get(row.day) ?? [],
  }));
}

export function uniqueActivityChannels(
  activities: SalesCurveActivity[],
): string[] {
  const seen = new Set<string>();
  const channels: string[] = [];
  for (const activity of activities) {
    const channel = activity.kind === "mail" ? "mail" : activity.channel;
    if (!channel || seen.has(channel)) continue;
    seen.add(channel);
    channels.push(channel);
    if (channels.length >= 3) break;
  }
  return channels;
}

export function sumSalesDays(points: SalesDayPoint[]): number {
  return points.reduce((sum, point) => sum + Math.max(0, Number(point.sold) || 0), 0);
}

/**
 * Prefer the Weeztix order histogram (first sale → event).
 * Snapshot deltas only cover days after inventory snapshots started.
 */
export function preferCompleteSalesCurve(input: {
  sold: number;
  orderDays: SalesDayPoint[];
  snapshotDays: SalesDayPoint[];
}): { points: SalesDayPoint[]; source: "orders" | "snapshots" } {
  if (input.orderDays.length > 0) {
    return { points: input.orderDays, source: "orders" };
  }
  const snapshotSum = sumSalesDays(input.snapshotDays);
  const sold = Math.max(0, input.sold);
  const snapshotIsStub = sold > 0 && snapshotSum < sold * 0.25;
  if (snapshotIsStub) {
    return { points: [], source: "snapshots" };
  }
  return { points: input.snapshotDays, source: "snapshots" };
}
