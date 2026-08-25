import { amsterdamDay } from "@/lib/time/amsterdam";

export type SoldOutTiming = {
  /** Calendar day (Amsterdam) when sell-out was reached. */
  day: string;
  /** 0 = on the event day; positive = days before start. */
  daysBefore: number;
  /**
   * ticket_types = max(updated_at) of sold-out Weeztix tiers;
   * curve = daily sales curve (only when usable).
   */
  confidence: "measured" | "estimated";
  source: "ticket_types" | "curve";
  /** Share of final sold covered by the daily curve (0–100), if curve used. */
  curveCoveragePct: number | null;
};

type TicketLike = {
  name?: string | null;
  status?: string | null;
  sold_count?: number | null;
  available_stock?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  available_from?: string | null;
};

function isoDay(value: string | Date): string {
  if (typeof value === "string") {
    // "2026-07-21T14:15:28+02:00" → Amsterdam calendar day
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return amsterdamDay(new Date(parsed));
    return value.slice(0, 10);
  }
  return amsterdamDay(value);
}

function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T12:00:00.000Z`);
  const b = Date.parse(`${later}T12:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Weeztix timeToBank is payment latency, not sales timeline — unusable for
 * sold-out day. Instead: among sold-out ticket types with real sales, take the
 * latest updated_at that moved after create (proxy for when that tier filled).
 */
export function estimateSoldOutFromTicketTypes(input: {
  eventDay: string;
  sold: number;
  capacity: number | null;
  tickets: TicketLike[];
  /** Publieke types / drempel al als uitverkocht gemarkeerd. */
  assumeSoldOut?: boolean;
}): SoldOutTiming | null {
  const capacity = input.capacity;
  if (!input.assumeSoldOut) {
    if (capacity == null || capacity <= 0) return null;
    if (input.sold < capacity * 0.995) return null;
  }

  const eventDay = isoDay(input.eventDay);
  let bestDay: string | null = null;

  for (const t of input.tickets) {
    const name = String(t.name ?? "");
    if (/\[DATUM\]/i.test(name)) continue;
    if (String(t.status ?? "").toLowerCase() !== "sold_out") continue;
    const sold = typeof t.sold_count === "number" ? t.sold_count : 0;
    const stock =
      typeof t.available_stock === "number" ? t.available_stock : null;
    if (sold <= 0) continue;
    if (stock != null && stock > 0 && sold < stock * 0.9) continue;
    if (!t.updated_at) continue;

    const updatedMs = Date.parse(t.updated_at);
    if (!Number.isFinite(updatedMs)) continue;
    const createdMs = t.created_at ? Date.parse(t.created_at) : NaN;
    // Skip pure create stamps (config writes). Keep updates ≥1h later.
    if (Number.isFinite(createdMs) && updatedMs - createdMs < 1 * 3600_000) {
      continue;
    }

    const day = amsterdamDay(new Date(updatedMs));
    if (day > eventDay) continue;
    if (!bestDay || day > bestDay) bestDay = day;
  }

  if (!bestDay) return null;
  return {
    day: bestDay,
    daysBefore: Math.max(0, daysBetween(bestDay, eventDay)),
    confidence: "estimated",
    source: "ticket_types",
    curveCoveragePct: null,
  };
}

/**
 * Fallback: daily curve only when not an event-day dump.
 */
export function estimateSoldOutFromCurve(input: {
  eventDay: string;
  sold: number;
  capacity: number | null;
  daily: Array<{ day: string; sold: number }>;
}): SoldOutTiming | null {
  const capacity = input.capacity;
  if (capacity == null || capacity <= 0) return null;
  if (input.sold < capacity * 0.995) return null;

  const eventDay = isoDay(input.eventDay);
  const daily = [...input.daily]
    .map((p) => ({ day: isoDay(p.day), sold: p.sold }))
    .filter((p) => p.day && p.day <= eventDay)
    .sort((a, b) => a.day.localeCompare(b.day));

  if (daily.length < 4) return null;

  const curveSum = daily.reduce((s, p) => s + p.sold, 0);
  if (curveSum <= 0) return null;

  const onEventDay = daily
    .filter((p) => p.day === eventDay)
    .reduce((s, p) => s + p.sold, 0);
  const beforeEvent = curveSum - onEventDay;
  if (onEventDay / curveSum > 0.4 || beforeEvent < capacity * 0.35) {
    return null;
  }

  const curveCoveragePct = Math.round(
    (100 * curveSum) / Math.max(input.sold, 1),
  );
  const missingBefore = Math.max(0, input.sold - curveSum);
  const target = capacity * 0.995;

  let cum = missingBefore;
  for (const p of daily) {
    cum += p.sold;
    if (cum >= target) {
      return {
        day: p.day,
        daysBefore: Math.max(0, daysBetween(p.day, eventDay)),
        confidence: missingBefore > 0 ? "estimated" : "measured",
        source: "curve",
        curveCoveragePct,
      };
    }
  }
  return null;
}

/** Prefer ticket-type timestamps; fall back to a clean daily curve. */
export function estimateSoldOutTiming(input: {
  eventDay: string;
  sold: number;
  capacity: number | null;
  daily?: Array<{ day: string; sold: number }>;
  tickets?: TicketLike[];
}): SoldOutTiming | null {
  if (input.tickets?.length) {
    const fromTickets = estimateSoldOutFromTicketTypes({
      eventDay: input.eventDay,
      sold: input.sold,
      capacity: input.capacity,
      tickets: input.tickets,
    });
    if (fromTickets) return fromTickets;
  }
  if (input.daily?.length) {
    return estimateSoldOutFromCurve({
      eventDay: input.eventDay,
      sold: input.sold,
      capacity: input.capacity,
      daily: input.daily,
    });
  }
  return null;
}

export function soldOutTimingLabel(t: SoldOutTiming): string {
  const approx = t.confidence === "estimated" ? "±" : "";
  if (t.daysBefore <= 0) return `${approx}Uitverkocht op de dag zelf`;
  if (t.daysBefore === 1) return `${approx}Uitverkocht 1 dag van tevoren`;
  if (t.daysBefore < 7)
    return `${approx}Uitverkocht ${t.daysBefore} dagen van tevoren`;
  if (t.daysBefore < 30)
    return `${approx}Uitverkocht ${t.daysBefore} dgn van tevoren`;
  return `${approx}Vroeg uitverkocht (${t.daysBefore} dgn van tevoren)`;
}
