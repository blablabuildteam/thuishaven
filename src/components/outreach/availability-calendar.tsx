import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import {
  availabilityCalendar,
  dayStatusLabels,
  formatEuro,
  type AvailabilityDay,
  type DayStatus,
} from "@/lib/mock/availability";
import { cn } from "@/lib/utils";

const statusStyles: Record<DayStatus, string> = {
  available:
    "border-accent bg-accent-soft dark:border-highlight dark:bg-accent-soft",
  booked_external: "border-border bg-surface opacity-60",
  own_event: "border-border bg-surface opacity-60",
  closed: "border-border bg-bg opacity-50",
  hold: "border-warn/50 bg-warn/10",
};

type AvailabilityCalendarProps = {
  /** Public view hides holds detail / shows softer labels */
  publicView?: boolean;
  onlyOpen?: boolean;
  className?: string;
  /** When provided, use DB/live days instead of mock */
  days?: AvailabilityDay[];
};

export function AvailabilityCalendar({
  publicView = false,
  onlyOpen = false,
  className,
  days: daysProp,
}: AvailabilityCalendarProps) {
  const source = daysProp ?? availabilityCalendar;
  const days = onlyOpen
    ? source.filter((d) => d.status === "available")
    : source;

  const byMonth = days.reduce<Record<string, AvailabilityDay[]>>((acc, day) => {
    const key = format(parseISO(day.date), "yyyy-MM");
    (acc[key] ??= []).push(day);
    return acc;
  }, {});

  return (
    <div className={cn("space-y-8", className)}>
      {Object.entries(byMonth).map(([monthKey, monthDays]) => (
        <section key={monthKey}>
          <div className="mb-3 flex items-end gap-3">
            <h2 className="font-display text-2xl tracking-[0.06em] text-text">
              {format(parseISO(`${monthKey}-01`), "MMMM yyyy", { locale: nl })}
            </h2>
            <div className="mb-1 h-px flex-1 bg-highlight" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {monthDays.map((day) => (
              <DayCard key={day.id} day={day} publicView={publicView} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DayCard({
  day,
  publicView,
}: {
  day: AvailabilityDay;
  publicView: boolean;
}) {
  const blocked =
    day.status === "closed" ||
    day.status === "own_event" ||
    day.status === "booked_external";
  const dateLabel = format(parseISO(day.date), "EEE d MMM", { locale: nl });

  return (
    <article
      className={cn(
        "relative border p-4 transition-colors",
        statusStyles[day.status],
      )}
    >
      {blocked && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="h-px w-[85%] rotate-[-8deg] bg-danger/80" />
        </span>
      )}
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg tracking-[0.06em] text-text">
            {dateLabel}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {day.label ?? dayStatusLabels[day.status]}
            {" · "}
            {day.dayPart === "full"
              ? "Hele dag"
              : day.dayPart === "day"
                ? "Overdag"
                : "Avond"}
          </p>
        </div>
        <StatusPill status={day.status} publicView={publicView} />
      </div>

      {day.status === "available" && day.priceFrom != null && (
        <p className="relative mt-3 font-display text-2xl tracking-[0.04em] text-accent">
          {formatEuro(day.priceFrom)}
          <span className="ml-1 text-xs font-sans tracking-normal text-text-dim">
            excl. · vanaf
          </span>
        </p>
      )}
      {day.priceNote && day.status === "available" && (
        <p className="relative mt-1 text-xs text-text-muted">{day.priceNote}</p>
      )}
      {day.areas && day.status === "available" && (
        <p className="relative mt-2 text-[11px] uppercase tracking-wider text-text-dim">
          {day.areas.join(" · ")}
        </p>
      )}
      {!publicView && day.notes && (
        <p className="relative mt-2 text-xs text-text-dim">{day.notes}</p>
      )}
    </article>
  );
}

function StatusPill({
  status,
  publicView,
}: {
  status: DayStatus;
  publicView: boolean;
}) {
  const label =
    publicView && status === "hold"
      ? "In optie"
      : publicView && status === "booked_external"
        ? "Bezet"
        : dayStatusLabels[status];

  const tone =
    status === "available"
      ? "bg-accent text-accent-contrast"
      : status === "hold"
        ? "bg-warn text-black"
        : status === "closed" || status === "own_event" || status === "booked_external"
          ? "bg-danger text-white"
          : "bg-surface text-text-muted";

  return (
    <span
      className={cn(
        "shrink-0 px-2 py-0.5 font-display text-[11px] tracking-[0.1em]",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function AvailabilityLegend() {
  const items: { status: DayStatus; hint: string }[] = [
    { status: "available", hint: "Boekbaar · prijs actueel" },
    { status: "hold", hint: "Tijdelijk gereserveerd" },
    { status: "own_event", hint: "Thuishaven programmering" },
    { status: "booked_external", hint: "Al verhuurd" },
    { status: "closed", hint: "Opbouw / dicht" },
  ];
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-text-muted">
      {items.map((item) => (
        <li key={item.status} className="flex items-center gap-2">
          <span
            className={cn("size-2.5 border", statusStyles[item.status])}
          />
          <span>
            <span className="font-medium text-text">
              {dayStatusLabels[item.status]}
            </span>
            {" — "}
            {item.hint}
          </span>
        </li>
      ))}
    </ul>
  );
}
