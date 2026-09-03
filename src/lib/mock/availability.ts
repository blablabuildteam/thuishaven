/**
 * Venue availability for B2B outreach — shared by internal UI + public live link.
 */

export type DayStatus =
  | "available"
  | "booked_external"
  | "own_event"
  | "closed"
  | "hold";

export type DayPart = "day" | "evening" | "full";

export type AvailabilityDay = {
  id: string;
  date: string; // YYYY-MM-DD
  status: DayStatus;
  dayPart: DayPart;
  label?: string;
  /** Dynamic list price for B2B hire (EUR, excl. BTW) */
  priceFrom?: number;
  priceNote?: string;
  areas?: string[]; // Tempel, Loods, Circus, …
  notes?: string;
};

export const dayStatusLabels: Record<DayStatus, string> = {
  available: "Beschikbaar",
  booked_external: "Bezet (extern)",
  own_event: "Eigen event",
  closed: "Gesloten",
  hold: "Option / hold",
};

export const PUBLIC_AVAILABILITY_PATH = "/beschikbaar";

/**
 * Deelbare agenda-URL in mails.
 * tools.thuishaven.nl wijst nog niet naar Vercel (Plesk/CF 404) —
 * tot DNS omstaat gebruiken we de werkende Vercel-app URL.
 */
export function getPublicAvailabilityUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  const base =
    fromEnv && !fromEnv.includes("tools.thuishaven.nl")
      ? fromEnv
      : "https://thuishaven.vercel.app";
  return `${base}${PUBLIC_AVAILABILITY_PATH}`;
}

/** @deprecated prefer getPublicAvailabilityUrl() — kept for static imports */
export const PUBLIC_AVAILABILITY_URL = "https://thuishaven.vercel.app/beschikbaar";

/** Aug–Sep 2026 weekday-focused mock calendar */
export const availabilityCalendar: AvailabilityDay[] = [
  {
    id: "d-0811",
    date: "2026-08-11",
    status: "available",
    dayPart: "full",
    priceFrom: 8500,
    priceNote: "Doordeweeks midweek",
    areas: ["Tempel", "Loods", "Circus"],
  },
  {
    id: "d-0812",
    date: "2026-08-12",
    status: "available",
    dayPart: "full",
    priceFrom: 8500,
    areas: ["Tempel", "Loods", "Circus"],
  },
  {
    id: "d-0813",
    date: "2026-08-13",
    status: "available",
    dayPart: "evening",
    label: "Avondslot",
    priceFrom: 6500,
    priceNote: "Alleen avond · dynamic low",
    areas: ["Loods", "Circus"],
  },
  {
    id: "d-0814",
    date: "2026-08-14",
    status: "closed",
    dayPart: "full",
    label: "Opbouw weekend",
    notes: "Terrein dicht voor opbouw",
  },
  {
    id: "d-0815",
    date: "2026-08-15",
    status: "own_event",
    dayPart: "full",
    label: "Benny Rodrigues 10HRS",
  },
  {
    id: "d-0818",
    date: "2026-08-18",
    status: "booked_external",
    dayPart: "full",
    label: "Corporate (bevestigd)",
    notes: "Niet tonen als beschikbaar",
  },
  {
    id: "d-0819",
    date: "2026-08-19",
    status: "available",
    dayPart: "full",
    priceFrom: 9500,
    priceNote: "Midweek · popular",
    areas: ["Tempel", "Loods", "Circus"],
  },
  {
    id: "d-0820",
    date: "2026-08-20",
    status: "hold",
    dayPart: "full",
    label: "Hold · pitch bureau",
    priceFrom: 9500,
    notes: "48u hold — nog niet definitief",
  },
  {
    id: "d-0821",
    date: "2026-08-21",
    status: "available",
    dayPart: "day",
    label: "Dagdeel",
    priceFrom: 5500,
    priceNote: "Dynamic · alleen overdag",
    areas: ["Tempel", "Circus"],
  },
  {
    id: "d-0825",
    date: "2026-08-25",
    status: "available",
    dayPart: "full",
    priceFrom: 7500,
    priceNote: "Last-minute midweek",
    areas: ["Tempel", "Loods", "Circus"],
  },
  {
    id: "d-0826",
    date: "2026-08-26",
    status: "available",
    dayPart: "full",
    priceFrom: 7500,
    areas: ["Tempel", "Loods", "Circus"],
  },
  {
    id: "d-0827",
    date: "2026-08-27",
    status: "available",
    dayPart: "full",
    priceFrom: 8500,
    areas: ["Tempel", "Loods", "Circus"],
  },
  {
    id: "d-0828",
    date: "2026-08-28",
    status: "closed",
    dayPart: "full",
    label: "Opbouw",
  },
  {
    id: "d-0829",
    date: "2026-08-29",
    status: "own_event",
    dayPart: "full",
    label: "Hollandse Haven",
  },
  {
    id: "d-0901",
    date: "2026-09-01",
    status: "available",
    dayPart: "full",
    priceFrom: 9000,
    areas: ["Tempel", "Loods", "Circus"],
  },
  {
    id: "d-0902",
    date: "2026-09-02",
    status: "available",
    dayPart: "full",
    priceFrom: 11000,
    priceNote: "September premium",
    areas: ["Tempel", "Loods", "Circus"],
  },
  {
    id: "d-0903",
    date: "2026-09-03",
    status: "available",
    dayPart: "evening",
    priceFrom: 7000,
    areas: ["Loods"],
  },
  {
    id: "d-0904",
    date: "2026-09-04",
    status: "booked_external",
    dayPart: "full",
    label: "Agency booking",
  },
];

export function openAvailabilityDays() {
  return availabilityCalendar.filter((d) => d.status === "available");
}

export function formatEuro(value: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
