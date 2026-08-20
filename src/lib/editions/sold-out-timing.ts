import { amsterdamDay } from "@/lib/time/amsterdam";

export type SoldOutTiming = {
  /** Calendar day (Amsterdam) when cumulative first hit ~cap. */
  day: string;
  /** 0 = on the event day; positive = days before start. */
  daysBefore: number;
  /**
   * measured = curve alone crossed cap;
   * estimated = gap before curve attributed as early sales.
   */
  confidence: "measured" | "estimated";
  /** Share of final sold covered by the daily curve (0–100). */
  curveCoveragePct: number;
};

function isoDay(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return amsterdamDay(value);
}

function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T12:00:00.000Z`);
  const b = Date.parse(`${later}T12:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * When inventory says sold-out, estimate how many days before the event
 * cumulative sales first reached the ticketcap.
 *
 * Only returns a value when the daily curve is usable. Many Weeztix curves
 * dump most volume on the event day — those are rejected so we don't claim
 * “uitverkocht op de dag zelf” incorrectly.
 */
export function estimateSoldOutTiming(input: {
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
  const eventDayShare = onEventDay / curveSum;

  // Reject event-day dumps (typical broken timeToBank harvest).
  if (eventDayShare > 0.4 || beforeEvent < capacity * 0.35) {
    return null;
  }

  const curveCoveragePct = Math.round(
    (100 * curveSum) / Math.max(input.sold, 1),
  );
  const missingBefore = Math.max(0, input.sold - curveSum);
  const target = capacity * 0.995;

  if (missingBefore >= target) {
    const first = daily[0]!.day;
    return {
      day: first,
      daysBefore: Math.max(0, daysBetween(first, eventDay)),
      confidence: "estimated",
      curveCoveragePct,
    };
  }

  let cum = missingBefore;
  for (const p of daily) {
    cum += p.sold;
    if (cum >= target) {
      return {
        day: p.day,
        daysBefore: Math.max(0, daysBetween(p.day, eventDay)),
        confidence: missingBefore > 0 ? "estimated" : "measured",
        curveCoveragePct,
      };
    }
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
