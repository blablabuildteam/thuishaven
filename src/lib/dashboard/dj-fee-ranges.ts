import { formatNumber } from "@/lib/utils";

export const DJ_FEE_RANGE_IDS = [
  "0",
  "0_600",
  "600_1000",
  "1000_2500",
  "2500_5000",
  "5000_10000",
  "10000_plus",
] as const;

export type DjFeeRangeId = (typeof DJ_FEE_RANGE_IDS)[number];

export type DjFeeArtistSource =
  | "resident_advisor"
  | "edition_name"
  | "custom";

export type DjFeeRangeDef = {
  id: DjFeeRangeId;
  label: string;
  min: number;
  max: number | null;
  className: string;
};

/**
 * Legacy bands from the Google Sheets DJ-fee overview. New entries are exact
 * amounts (`feeAmount`); a band only counts while no amount is filled in.
 */
export const DJ_FEE_RANGES: readonly DjFeeRangeDef[] = [
  {
    id: "0",
    label: "€0",
    min: 0,
    max: 0,
    className:
      "bg-stone-200 text-stone-900 dark:bg-stone-700/70 dark:text-stone-100",
  },
  {
    id: "0_600",
    label: "€0–€600",
    min: 0,
    max: 600,
    className:
      "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100",
  },
  {
    id: "600_1000",
    label: "€600–€1.000",
    min: 600,
    max: 1000,
    className: "bg-sky-100 text-sky-950 dark:bg-sky-900/50 dark:text-sky-100",
  },
  {
    id: "1000_2500",
    label: "€1.000–€2.500",
    min: 1000,
    max: 2500,
    className:
      "bg-yellow-100 text-yellow-950 dark:bg-yellow-900/45 dark:text-yellow-100",
  },
  {
    id: "2500_5000",
    label: "€2.500–€5.000",
    min: 2500,
    max: 5000,
    className:
      "bg-orange-100 text-orange-950 dark:bg-orange-900/45 dark:text-orange-100",
  },
  {
    id: "5000_10000",
    label: "€5.000–€10.000",
    min: 5000,
    max: 10000,
    className: "bg-rose-100 text-rose-950 dark:bg-rose-900/45 dark:text-rose-100",
  },
  {
    id: "10000_plus",
    label: "€10.000+",
    min: 10000,
    max: null,
    className:
      "bg-violet-100 text-violet-950 dark:bg-violet-900/45 dark:text-violet-100",
  },
];

const RANGE_BY_ID = new Map(DJ_FEE_RANGES.map((r) => [r.id, r]));

export function isDjFeeRangeId(value: string): value is DjFeeRangeId {
  return RANGE_BY_ID.has(value as DjFeeRangeId);
}

export function djFeeRangeDef(id: DjFeeRangeId | null): DjFeeRangeDef | null {
  if (!id) return null;
  return RANGE_BY_ID.get(id) ?? null;
}

export function formatEuroAmount(value: number): string {
  return `€${formatNumber(value)}`;
}

export const DJ_FEE_AMOUNT_MAX = 1_000_000;

/** Parse a typed fee ("1.250", "€ 800", "1250,00") to whole euros. */
export function parseDjFeeAmount(raw: string): number | null | "invalid" {
  const cleaned = raw.replace(/[€\s]/g, "").replace(/[.,]\d{1,2}$/, "");
  if (cleaned === "") return null;
  const digits = cleaned.replace(/[.,]/g, "");
  if (!/^\d+$/.test(digits)) return "invalid";
  const value = Number(digits);
  if (value > DJ_FEE_AMOUNT_MAX) return "invalid";
  return value;
}

export type DjFeeSpend = {
  min: number;
  max: number;
  openEnded: boolean;
  priced: number;
  /** DJs counted via a legacy band instead of an exact amount. */
  ranged: number;
  missing: number;
};

export function emptyDjFeeSpend(): DjFeeSpend {
  return { min: 0, max: 0, openEnded: false, priced: 0, ranged: 0, missing: 0 };
}

export type DjFeeValue = {
  feeAmount: number | null;
  feeRange: DjFeeRangeId | null;
};

export function hasDjFee(fee: DjFeeValue): boolean {
  return fee.feeAmount != null || fee.feeRange != null;
}

/** Display label for one DJ: the exact amount, else the legacy band. */
export function djFeeLabel(fee: DjFeeValue): string | null {
  if (fee.feeAmount != null) return formatEuroAmount(fee.feeAmount);
  return djFeeRangeDef(fee.feeRange)?.label ?? null;
}

export function addDjFeeToSpend(spend: DjFeeSpend, fee: DjFeeValue): void {
  if (fee.feeAmount != null) {
    spend.priced += 1;
    spend.min += fee.feeAmount;
    spend.max += fee.feeAmount;
    return;
  }
  const def = fee.feeRange ? RANGE_BY_ID.get(fee.feeRange) : undefined;
  if (!def) {
    spend.missing += 1;
    return;
  }
  spend.priced += 1;
  spend.ranged += 1;
  spend.min += def.min;
  if (def.max == null) {
    spend.openEnded = true;
    spend.max += def.min;
  } else {
    spend.max += def.max;
  }
}

export function formatDjFeeSpend(spend: DjFeeSpend): string {
  if (spend.priced === 0) return "—";
  if (spend.openEnded) {
    if (spend.min === 0) return "€10.000+";
    return `${formatEuroAmount(spend.min)}+`;
  }
  if (spend.min === spend.max) return formatEuroAmount(spend.min);
  return `${formatEuroAmount(spend.min)}–${formatEuroAmount(spend.max)}`;
}

/** Caveat for copy: empty when every priced DJ has an exact amount. */
export function djFeeRangeNote(spend: DjFeeSpend): string {
  if (spend.ranged === 0) return "";
  return spend.ranged === spend.priced
    ? " Fees zijn bandbreedtes, geen exacte bedragen."
    : " Een deel van de fees is nog een bandbreedte.";
}

export function countMissingDjFees(artists: ReadonlyArray<DjFeeValue>): number {
  return artists.filter((artist) => !hasDjFee(artist)).length;
}

export function eventNeedsDjFees(artists: ReadonlyArray<DjFeeValue>): boolean {
  return countMissingDjFees(artists) > 0;
}

/** Exact total when every fee is an amount; band midpoint when legacy ranges are in. */
export function djFeeSpendMidpoint(spend: DjFeeSpend): number | null {
  if (spend.priced === 0) return null;
  return Math.round((spend.min + spend.max) / 2);
}

export type DjFeeInvestmentLevel = 1 | 2 | 3 | 4 | 5;

export function djFeeInvestmentLevelLabel(level: DjFeeInvestmentLevel): string {
  if (level === 5) return "zeer hoge DJ-fee investering";
  if (level === 4) return "hoge DJ-fee investering";
  if (level === 3) return "gemiddelde DJ-fee investering";
  if (level === 2) return "lage DJ-fee investering";
  return "zeer lage DJ-fee investering";
}

/** Rank spend midpoints vs other events (quintiles). Same 1–5 language as organic. */
export function rankDjFeeInvestment(
  midpoints: number[],
): ((mid: number) => DjFeeInvestmentLevel) | null {
  if (midpoints.length === 0) return null;
  const values = [...midpoints].sort((a, b) => a - b);
  const lo = values[0]!;
  const hi = values[values.length - 1]!;
  if (lo === hi) return () => 3;
  const at = (p: number) => {
    const idx = (values.length - 1) * p;
    const a = Math.floor(idx);
    const b = Math.ceil(idx);
    if (a === b) return values[a]!;
    return values[a]! + (values[b]! - values[a]!) * (idx - a);
  };
  const t1 = at(0.2);
  const t2 = at(0.4);
  const t3 = at(0.6);
  const t4 = at(0.8);
  return (mid: number): DjFeeInvestmentLevel => {
    if (mid <= t1) return 1;
    if (mid <= t2) return 2;
    if (mid <= t3) return 3;
    if (mid <= t4) return 4;
    return 5;
  };
}

export const DJ_FEES_FROM_YEAR = 2026;

export function djFeesFromDate(): Date {
  return new Date(`${DJ_FEES_FROM_YEAR}-01-01T00:00:00+01:00`);
}

export function monthKeyFromDay(day: string): string {
  return day.slice(0, 7);
}

export function monthLabelFromDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
}

export function monthNameFromDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("nl-NL", {
    month: "long",
  });
}

export type DjFeeArtistView = {
  id: string;
  name: string;
  feeAmount: number | null;
  /** Legacy band, only shown while feeAmount is empty. */
  feeRange: DjFeeRangeId | null;
  isTenHour: boolean;
  source: DjFeeArtistSource;
};

export type DjFeeEventView = {
  id: string;
  name: string;
  day: string;
  startsAt: string;
  isTenHourEvent: boolean;
  artistsSource: "resident_advisor" | "edition_name" | "none";
  artists: DjFeeArtistView[];
  spend: DjFeeSpend;
};

export const DJ_FEES_CHANGED_EVENT = "thuishaven:dj-fees-changed";

export function notifyDjFeesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DJ_FEES_CHANGED_EVENT));
}
