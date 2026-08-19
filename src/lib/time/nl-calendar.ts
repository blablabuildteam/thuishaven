import { isOutdoorSeason, shiftIsoDay } from "@/lib/time/amsterdam";

/**
 * NL kalenderhelpers voor event-filters / claims.
 * Paas/Pinksteren via Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 */

export type CalendarPeriod =
  | "outdoor"
  | "winter"
  | "paas"
  | "pinksteren"
  | "koningsdag"
  | "ade";

export const CALENDAR_PERIOD_LABEL: Record<CalendarPeriod, string> = {
  outdoor: "Outdoor (mei–sept)",
  winter: "Winter",
  paas: "Paas-window",
  pinksteren: "Pinksteren",
  koningsdag: "Koningsdag ±1",
  ade: "ADE-week",
};

export type WeekdayKey = "vr" | "za" | "zo" | "other";

export const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  vr: "Vr",
  za: "Za",
  zo: "Zo",
  other: "Overig",
};

/** Easter Sunday YYYY-MM-DD (Gregorian). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inInclusiveRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

/** Goede Vrijdag → 2e paasdag (±1 buffer). */
export function paasWindow(year: number): { start: string; end: string } {
  const easter = easterSunday(year);
  return {
    start: shiftIsoDay(easter, -3), // do voor Goede Vrijdag
    end: shiftIsoDay(easter, 2), // ma + buffer
  };
}

/** Pinksteren zondag ±1 (Pasen + 49). */
export function pinksterenWindow(year: number): { start: string; end: string } {
  const easter = easterSunday(year);
  const pinkster = shiftIsoDay(easter, 49);
  return {
    start: shiftIsoDay(pinkster, -1),
    end: shiftIsoDay(pinkster, 1),
  };
}

/** Koningsdag 27 apr ±1. */
export function koningsdagWindow(year: number): { start: string; end: string } {
  const day = `${year}-04-27`;
  return { start: shiftIsoDay(day, -1), end: shiftIsoDay(day, 1) };
}

/** ADE ~15–19 okt (stad-wide electronic week). */
export function adeWeekWindow(year: number): { start: string; end: string } {
  return { start: `${year}-10-15`, end: `${year}-10-19` };
}

export function weekdayKeyFromIso(dayIso: string): WeekdayKey {
  const d = new Date(`${dayIso}T12:00:00.000Z`);
  const wd = d.getUTCDay(); // 0 zo … 5 vr 6 za
  if (wd === 5) return "vr";
  if (wd === 6) return "za";
  if (wd === 0) return "zo";
  return "other";
}

export function yearFromIso(dayIso: string): number {
  return Number(dayIso.slice(0, 4));
}

/**
 * Alle periodes die op deze eventdag van toepassing zijn.
 * Outdoor/winter zijn altijd één van beide (seizoen).
 */
export function periodsForDay(dayIso: string): CalendarPeriod[] {
  const year = yearFromIso(dayIso);
  if (!Number.isFinite(year) || year < 2000) return [];

  const out: CalendarPeriod[] = [];
  if (isOutdoorSeason(dayIso)) out.push("outdoor");
  else out.push("winter");

  const paas = paasWindow(year);
  if (inInclusiveRange(dayIso, paas.start, paas.end)) out.push("paas");

  const pink = pinksterenWindow(year);
  if (inInclusiveRange(dayIso, pink.start, pink.end)) out.push("pinksteren");

  const king = koningsdagWindow(year);
  if (inInclusiveRange(dayIso, king.start, king.end)) out.push("koningsdag");

  const ade = adeWeekWindow(year);
  if (inInclusiveRange(dayIso, ade.start, ade.end)) out.push("ade");

  return out;
}

/** Genre/room noise die geen DJ-filter mag worden. */
const ARTIST_NOISE = new Set(
  [
    "house",
    "deephouse",
    "techno",
    "trance",
    "hardtechno",
    "afrohouse",
    "melodic",
    "minimal",
    "drumandbass",
    "dnb",
    "garage",
    "disco",
    "ambient",
  ].map((s) => s.toLowerCase()),
);

export function isUsableArtistName(name: string): boolean {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key || key.length < 2) return false;
  if (ARTIST_NOISE.has(key)) return false;
  if (/^(hou|tec|hte|tra|aho)$/i.test(name)) return false;
  return true;
}
