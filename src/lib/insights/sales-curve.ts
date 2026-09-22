import { amsterdamDay, formatDayShort, shiftIsoDay } from "@/lib/time/amsterdam";

export type SalesDayPoint = {
  day: string;
  sold: number;
};

export type SalesCurveActivity = {
  kind: "social" | "mail" | "paid";
  channel: string;
  title: string;
};

export type SalesCurveActivityMark = {
  channel: string;
  paid: boolean;
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
  const end =
    eventDay && eventDay > lastSale ? eventDay : lastSale;

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
  ads?: Array<{
    publishedAt: string | null;
    dateStart: string | null;
    platform: string;
    campaignName: string | null;
    adName: string | null;
  }>;
}): Map<string, SalesCurveActivity[]> {
  const byDay = new Map<string, SalesCurveActivity[]>();

  function push(day: string, activity: SalesCurveActivity) {
    if (!day && activity.kind !== "paid") return;
    const key = day || "";
    const list = byDay.get(key) ?? [];
    list.push(activity);
    byDay.set(key, list);
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
  for (const ad of input.ads ?? []) {
    const title = ad.adName?.trim() || ad.campaignName?.trim() || "Paid ad";
    push(paidActivityDay(ad), {
      kind: "paid",
      channel: ad.platform,
      title,
    });
  }
  return byDay;
}

/** YYYY-MM-DD for a paid ad, or "" when the payload has no usable date. */
function paidActivityDay(ad: {
  publishedAt: string | null;
  dateStart: string | null;
}): string {
  const published =
    typeof ad.publishedAt === "string" ? ad.publishedAt.trim() : "";
  const start = typeof ad.dateStart === "string" ? ad.dateStart.trim() : "";
  const raw = published || start;
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) && !raw.includes("T")) {
    return raw.slice(0, 10);
  }
  return amsterdamDay(raw);
}

export function applyActivitiesToSeries(
  series: SalesCurvePoint[],
  byDay: Map<string, SalesCurveActivity[]>,
): SalesCurvePoint[] {
  if (byDay.size === 0 || series.length === 0) return series;
  const first = series[0]!.day;
  const last = series[series.length - 1]!.day;
  const indexByDay = new Map(series.map((row, index) => [row.day, index]));
  const eventIndex = series.findIndex((row) => row.isEvent);
  const buckets = series.map(() => [] as SalesCurveActivity[]);

  for (const [day, list] of byDay) {
    const organic = list.filter((activity) => activity.kind !== "paid");
    const paid = list.filter((activity) => activity.kind === "paid");
    const key = day.slice(0, 10);
    const exact = key ? indexByDay.get(key) : undefined;
    if (exact != null) {
      buckets[exact]!.push(...organic, ...paid);
      continue;
    }
    if (organic.length > 0 && key) {
      const organicIndex = indexByDay.get(key);
      if (organicIndex != null) buckets[organicIndex]!.push(...organic);
    }
    if (paid.length === 0) continue;
    const target = !key
      ? eventIndex >= 0
        ? eventIndex
        : 0
      : key < first
        ? 0
        : key > last
          ? series.length - 1
          : nearestSeriesIndex(series, key);
    buckets[target]!.push(...paid);
  }

  return series.map((row, index) => ({
    ...row,
    activities: buckets[index]!,
  }));
}

function nearestSeriesIndex(series: SalesCurvePoint[], day: string): number {
  const target = Date.parse(`${day}T12:00:00Z`);
  if (Number.isNaN(target)) return 0;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < series.length; index++) {
    const distance = Math.abs(
      Date.parse(`${series[index]!.day}T12:00:00Z`) - target,
    );
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

export function uniqueActivityChannels(
  activities: SalesCurveActivity[],
): string[] {
  return uniqueActivityMarks(activities).map((mark) => mark.channel);
}

/** Organic vs paid of the same channel stay separate (green paid mark). */
export function uniqueActivityMarks(
  activities: SalesCurveActivity[],
): SalesCurveActivityMark[] {
  const seen = new Set<string>();
  const marks: SalesCurveActivityMark[] = [];
  for (const activity of activities) {
    const paid = activity.kind === "paid";
    const channel = activity.kind === "mail" ? "mail" : activity.channel;
    if (!channel) continue;
    const key = `${paid ? "paid" : "organic"}:${channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push({ channel, paid });
    if (marks.length >= 4) break;
  }
  return marks;
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
