/**
 * Expand sparse venue days into full calendar months (Mon–Sun weeks).
 * Missing weekdays → closed; weekends → own_event (niet B2B-doordeweeks).
 */

import {
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import type { AvailabilityDay, DayStatus } from "@/lib/mock/availability";

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

/** Fill every day in months that appear in `days`. */
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
      const iso = format(day, "yyyy-MM-dd");
      const existing = byDate.get(iso);
      if (existing) {
        out.push(existing);
        continue;
      }
      const weekday = day.getDay(); // 0 Sun … 6 Sat
      const weekend = weekday === 0 || weekday === 6;
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
