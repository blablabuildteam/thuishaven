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
