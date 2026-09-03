import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import {
  dayStatusLabels,
  formatEuro,
  type AvailabilityDay,
  type DayStatus,
} from "@/lib/mock/availability";
import { cn } from "@/lib/utils";

function publicStatusLabel(status: DayStatus): string {
  if (status === "available") return "Open";
  if (status === "hold") return "In optie";
  if (status === "own_event") return "Eigen event";
  if (status === "booked_external") return "Bezet";
  return "Dicht";
}

function isBlocked(status: DayStatus) {
  return (
    status === "closed" ||
    status === "own_event" ||
    status === "booked_external"
  );
}

type Props = {
  days: AvailabilityDay[];
};

/** Public B2B agenda — thuishaven.nl look: cream sunburst, bars, chevron badges. */
export function PublicAvailabilityAgenda({ days }: Props) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = sorted.reduce<Record<string, AvailabilityDay[]>>((acc, day) => {
    const key = format(parseISO(day.date), "yyyy-MM");
    (acc[key] ??= []).push(day);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      {Object.entries(byMonth).map(([monthKey, monthDays]) => (
        <section key={monthKey} className="th-agenda-month">
          <h2 className="th-agenda-month-title">
            <span>
              {format(parseISO(`${monthKey}-01`), "MMMM", { locale: nl })}
            </span>
          </h2>

          <ul className="mt-5 space-y-3">
            {monthDays.map((day, i) => (
              <li
                key={day.id}
                className="th-agenda-row"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="th-agenda-bar">
                  <div className="min-w-0 flex-1">
                    <p className="th-agenda-bar-title">
                      {format(parseISO(day.date), "dd MMM", { locale: nl })}
                      {" | "}
                      {(day.label ?? dayStatusLabels[day.status]).toUpperCase()}
                    </p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-black/45">
                      {day.dayPart === "full"
                        ? "Hele dag"
                        : day.dayPart === "day"
                          ? "Overdag"
                          : "Avond"}
                      {day.areas?.length ? ` · ${day.areas.join(" · ")}` : ""}
                      {day.status === "available" && day.priceFrom != null
                        ? ` · vanaf ${formatEuro(day.priceFrom)} excl.`
                        : ""}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "th-agenda-badge",
                    day.status === "available" && "th-agenda-badge--open",
                    day.status === "hold" && "th-agenda-badge--hold",
                    isBlocked(day.status) && "th-agenda-badge--blocked",
                  )}
                >
                  {publicStatusLabel(day.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
