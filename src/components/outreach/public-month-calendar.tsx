import {
  addDays,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { nl } from "date-fns/locale";
import {
  dayStatusLabels,
  formatEuro,
  type AvailabilityDay,
  type DayStatus,
} from "@/lib/mock/availability";
import { cn } from "@/lib/utils";

/** Wed–Sun only (no Mon/Tue). */
const WEEKDAYS = ["wo", "do", "vr", "za", "zo"] as const;

function publicStatusLabel(status: DayStatus): string {
  if (status === "available") return "Open";
  if (status === "hold") return "Optie";
  if (status === "booked_external") return "Bezet";
  if (status === "own_event") return "Event";
  return "Dicht";
}

function isBlocked(status: DayStatus) {
  return (
    status === "closed" ||
    status === "own_event" ||
    status === "booked_external"
  );
}

/** Build Wed–Sun rows for a month (Mon/Tue skipped). */
function weeksForMonth(
  monthKey: string,
  byDate: Map<string, AvailabilityDay>,
): (AvailabilityDay | null)[][] {
  const monthStart = startOfMonth(parseISO(`${monthKey}-01`));
  const weeks: (AvailabilityDay | null)[][] = [];
  const dow = monthStart.getDay(); // 0 Sun
  const toMonday = dow === 0 ? -6 : 1 - dow;
  let weekMonday = addDays(monthStart, toMonday);

  for (let w = 0; w < 6; w++) {
    const week: (AvailabilityDay | null)[] = [];
    let anyInMonth = false;
    for (const offset of [2, 3, 4, 5, 6]) {
      const day = addDays(weekMonday, offset);
      const iso = format(day, "yyyy-MM-dd");
      const inMonth = iso.startsWith(monthKey);
      if (inMonth) anyInMonth = true;
      week.push(inMonth ? byDate.get(iso) ?? null : null);
    }
    if (anyInMonth) weeks.push(week);
    weekMonday = addDays(weekMonday, 7);
  }
  return weeks;
}

type Props = {
  days: AvailabilityDay[];
  className?: string;
};

/** Full-month Wed–Sun grid for public /beschikbaar. */
export function PublicMonthCalendar({ days, className }: Props) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const monthKeys = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();

  return (
    <div className={cn("space-y-10 sm:space-y-12", className)}>
      {monthKeys.map((monthKey) => {
        const weeks = weeksForMonth(monthKey, byDate);
        return (
          <section key={monthKey}>
            <div className="mb-3 flex items-end gap-3 sm:mb-4">
              <h2 className="shrink-0 font-display text-xl tracking-[0.06em] text-black sm:text-2xl md:text-[2rem]">
                {format(parseISO(`${monthKey}-01`), "MMMM yyyy", { locale: nl })}
              </h2>
              <div className="mb-1 h-px flex-1 bg-[#fff201]" />
            </div>

            {/* Swipeable on narrow screens so 5 cols stay readable */}
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
              <div className="min-w-[34rem] sm:min-w-0">
                <div className="mb-2 grid grid-cols-5 gap-2 md:gap-3">
                  {WEEKDAYS.map((d) => (
                    <p
                      key={d}
                      className="text-center font-display text-[10px] tracking-[0.14em] text-black/40 sm:text-xs"
                    >
                      {d}
                    </p>
                  ))}
                </div>

                <div className="space-y-2 md:space-y-3">
                  {weeks.map((week, wi) => (
                    <div
                      key={wi}
                      className="grid grid-cols-5 gap-2 md:gap-3"
                    >
                      {week.map((day, di) =>
                        day ? (
                          <DayCell key={day.id} day={day} />
                        ) : (
                          <div
                            key={`e-${wi}-${di}`}
                            className="min-h-[4.25rem] sm:min-h-[5.25rem] md:min-h-[6rem]"
                          />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DayCell({ day }: { day: AvailabilityDay }) {
  const blocked = isBlocked(day.status);
  const open = day.status === "available";
  const hold = day.status === "hold";
  const dateNum = format(parseISO(day.date), "d");

  return (
    <article
      className={cn(
        "relative flex min-h-[4.25rem] flex-col border border-black/25 bg-white p-2 sm:min-h-[5.25rem] sm:p-2.5 md:min-h-[6rem] md:p-3",
        open && "border-black/80 shadow-[2px_2px_0_rgba(0,0,0,0.06)]",
        hold && "border-[#c9a227]/70 bg-[#fff8dc]/70",
        blocked && "border-black/15 bg-[#f7f4f0]",
      )}
    >
      {blocked && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="h-px w-[78%] rotate-[-10deg] bg-[#d22624]/35" />
        </span>
      )}

      <div className="relative flex items-start justify-between gap-1">
        <p
          className={cn(
            "font-display text-sm tracking-[0.04em] sm:text-base md:text-lg",
            blocked ? "text-black/45" : "text-black",
          )}
        >
          {dateNum}
        </p>
        <span
          className={cn(
            "shrink-0 px-1.5 py-0.5 font-display text-[8px] leading-none tracking-[0.08em] sm:text-[10px]",
            open && "bg-black text-[#fff201]",
            hold && "bg-[#f1c40f]/90 text-black",
            blocked && "bg-[#e8a09a] text-white",
          )}
        >
          {publicStatusLabel(day.status)}
        </span>
      </div>

      <p
        className={cn(
          "relative mt-auto pt-1 text-[9px] leading-snug sm:text-[10px] md:text-[11px]",
          blocked ? "text-black/35" : "text-black/50",
        )}
      >
        {open
          ? day.priceFrom != null
            ? formatEuro(day.priceFrom)
            : day.label?.replace(/^Beschikbaar\s*·\s*/i, "") || "Hele dag"
          : day.label ?? dayStatusLabels[day.status]}
      </p>
    </article>
  );
}
