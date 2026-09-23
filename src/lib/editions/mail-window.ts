import { rememberTtl } from "@/lib/cache/ttl";
import {
  fetchWeeztixHourlyTickets,
  type HourlyTicketPoint,
} from "@/lib/integrations/weeztix/daily";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = 24 * HOUR_MS;
const CURVE_TTL_MS = 15 * 60 * 1000;

export type { HourlyTicketPoint };

/**
 * Tickets whose sale hour overlaps [sentAt, sentAt + 24h).
 * The send hour counts in full — Weeztix only buckets by hour.
 */
export function ticketsSoldIn24h(
  points: HourlyTicketPoint[],
  sentAt: Date,
): number {
  const start = sentAt.getTime();
  const end = start + WINDOW_MS;
  let sold = 0;
  for (const point of points) {
    const bucketEnd = point.at + HOUR_MS;
    if (bucketEnd <= start || point.at >= end) continue;
    sold += point.sold;
  }
  return sold;
}

function hourFloor(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  }
  const workers = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/**
 * Hourly Weeztix curves for mailed editions.
 * `null` means the curve could not be loaded (do not treat as zero).
 */
export async function loadMailHourCurves(
  editions: Array<{
    editionId: string;
    guid: string;
    from: Date;
    to: Date;
  }>,
): Promise<Map<string, HourlyTicketPoint[] | null>> {
  const curves = new Map<string, HourlyTicketPoint[] | null>();
  if (editions.length === 0) return curves;

  await mapPool(editions, 4, async (edition) => {
    const from = hourFloor(edition.from.getTime());
    const to = hourFloor(edition.to.getTime()) + HOUR_MS;
    const key = `mail-hours:${edition.guid}:${from}:${to}`;
    const points = await rememberTtl(key, CURVE_TTL_MS, async () => {
      const curve = await fetchWeeztixHourlyTickets({
        eventGuid: edition.guid,
        start: new Date(from),
        end: new Date(to),
      });
      if (curve.error) return null;
      return curve.points;
    });
    curves.set(edition.editionId, points);
  });

  return curves;
}
