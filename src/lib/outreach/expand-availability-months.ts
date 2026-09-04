/**
 * Expand sparse venue days into full months (Wed–Sun only).
 * Mon/Tue are never shown — B2B midweek + weekend programmering.
 * Missing Wed–Fri → closed; Sat/Sun → own_event.
 */

import {
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import type { AvailabilityDay, DayStatus } from "@/lib/mock/availability";

/** JS getDay(): 0=Sun … 6=Sat. Skip Mon(1) and Tue(2). */
export function isShownWeekday(jsDay: number): boolean {
  return jsDay !== 1 && jsDay !== 2;
}

function monthKeysFromDays(days: AvailabilityDay[]): string[] {
  const keys = new Set(days.map((d) => d.date.slice(0, 7)));
  return [...keys].sort();
}

function fillerDay(iso: string, status: DayStatus, label: string): AvailabilityDay {
  return {
    id: `fill-${iso}`,
    date: iso,
    status,
    dayPart: "full",
    label,
  };
}

/** Fill Wed–Sun in months that appear in `days`. */
export function expandAvailabilityToFullMonths(
  days: AvailabilityDay[],
): AvailabilityDay[] {
  if (!days.length) return [];

  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: AvailabilityDay[] = [];

  for (const monthKey of monthKeysFromDays(days)) {
    const start = startOfMonth(parseISO(`${monthKey}-01`));
    const end = endOfMonth(start);
    for (const day of eachDayOfInterval({ start, end })) {
      const jsDay = day.getDay();
      if (!isShownWeekday(jsDay)) continue;

      const iso = format(day, "yyyy-MM-dd");
      const existing = byDate.get(iso);
      if (existing) {
        out.push(existing);
        continue;
      }
      const weekend = jsDay === 0 || jsDay === 6;
      out.push(
        fillerDay(
          iso,
          weekend ? "own_event" : "closed",
          weekend ? "Weekend" : "Niet beschikbaar",
        ),
      );
    }
  }

  return out;
}
