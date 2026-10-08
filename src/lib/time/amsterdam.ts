/** Calendar day in Europe/Amsterdam as YYYY-MM-DD. */
export function amsterdamDay(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function amsterdamMonth(dayIso: string): number | null {
  if (!dayIso || dayIso.length < 7) return null;
  const m = Number(dayIso.slice(5, 7));
  return Number.isFinite(m) ? m : null;
}

/** Outdoor-seizoen Thuishaven (mei–sept). */
export function isOutdoorSeason(dayIso: string): boolean {
  const m = amsterdamMonth(dayIso);
  return m != null && m >= 5 && m <= 9;
}

export function shiftIsoDay(dayIso: string, deltaDays: number): string {
  const d = new Date(`${dayIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function formatDayShort(dayIso: string): string {
  const d = new Date(`${dayIso}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(d);
}

export function formatDayNl(dayIso: string): string {
  const d = new Date(`${dayIso}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Ticketssheet-datum: "SUN 9 sep. 2026" (weekdag in Amsterdam). */
export function formatTicketSheetDate(dayIso: string): string {
  const d = new Date(`${dayIso}T12:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  })
    .format(d)
    .toUpperCase();
  const date = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  return `${weekday} ${date}`;
}

/** Hours (Europe/Amsterdam) when the Weeztix sales sync runs. */
export const AMSTERDAM_SYNC_HOURS = [8, 13, 19, 23] as const;

function amsterdamHourMinute(at: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = read("hour");
  return { hour: hour === 24 ? 0 : hour, minute: read("minute") };
}

/** Next planned Weeztix sync: today at 08:00, 13:00, 19:00, or 23:00, else tomorrow 08:00. */
export function formatNextAmsterdamSync(at: Date = new Date()): string {
  const { hour, minute } = amsterdamHourMinute(at);
  const current = hour * 60 + minute;
  const nextHour = AMSTERDAM_SYNC_HOURS.find((slot) => slot * 60 > current);
  const clock = `${String(nextHour ?? AMSTERDAM_SYNC_HOURS[0]).padStart(2, "0")}:00`;
  return `Volgende automatisch ${nextHour != null ? "vandaag" : "morgen"} ${clock}`;
}

export function amsterdamClock(input: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(input);
}

/**
 * Convert an Amsterdam calendar day (YYYY-MM-DD) + HH:MM into a UTC Date.
 * Iteratively corrects for CET/CEST so schedule slots land on the intended local time.
 */
export function amsterdamDateTimeToUtc(dayIso: string, timeHm: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(timeHm.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso) || !match) {
    return new Date(Number.NaN);
  }
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const pad = (n: number) => String(n).padStart(2, "0");
  let utc = Date.parse(`${dayIso}T${pad(hh)}:${pad(mm)}:00.000Z`);
  const parseNaive = (s: string) => {
    const [d, t] = s.split("T");
    const [Y, M, D] = d!.split("-").map(Number);
    const [H, Mi, S] = t!.split(":").map(Number);
    return Date.UTC(Y!, M! - 1, D!, H!, Mi!, S || 0);
  };
  for (let i = 0; i < 5; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Amsterdam",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(utc))
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const asShown = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    const want = `${dayIso}T${pad(hh)}:${pad(mm)}:00`;
    utc += parseNaive(want) - parseNaive(asShown);
  }
  return new Date(utc);
}

export function formatEventClockRange(
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
  startTime?: string | null,
  endTime?: string | null,
): string | null {
  if (startTime || endTime) {
    if (startTime && endTime) return `${startTime}–${endTime}`;
    return startTime ?? endTime ?? null;
  }
  if (!startsAt) return null;
  const start = amsterdamClock(startsAt);
  if (!endsAt) return start;
  return `${start}–${amsterdamClock(endsAt)}`;
}
