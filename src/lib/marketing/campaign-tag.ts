import { MONTHS } from "@/lib/marketing/edition-link";

const MONTH_WORD = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** `23 OKT | CONVERSIONS | …` or `23 oktober | search [artist] | …` */
const LEADING_DATE_RE = new RegExp(
  `^\\s*(\\d{1,2})\\s+(${MONTH_WORD})\\.?(?:\\s+(\\d{4}))?\\s*(?:\\||$)`,
  "i",
);

const ANY_DATE_RE = new RegExp(
  `\\b(\\d{1,2})\\s+(${MONTH_WORD})\\b(?:\\s+(\\d{4}))?`,
  "i",
);

/** Always-on brand campaigns: no single event behind the spend. */
const BRAND_CAMPAIGN_RE =
  /\b(nurture|retargeting|prospecting|always on|liveset|demand-gen|artiesten|festival)\b/i;

export type CampaignDate = { m: number; d: number; y: number | null; label: string };

function toDate(match: RegExpMatchArray | null): CampaignDate | null {
  if (!match) return null;
  const d = Number(match[1]);
  const m = MONTHS[match[2]!.toLowerCase()];
  if (!m || d < 1 || d > 31) return null;
  return {
    m,
    d,
    y: match[3] ? Number(match[3]) : null,
    label: `${d} ${match[2]!.toUpperCase()}`,
  };
}

/** The event date the team puts at the start of every event campaign name. */
export function parseCampaignDate(name: string | null | undefined): CampaignDate | null {
  return name ? toDate(name.match(LEADING_DATE_RE)) : null;
}

/** A date anywhere in an ad or creative name, e.g. `8 NOV 2026 2 9-16_….mp4`. */
export function findNameDate(name: string | null | undefined): CampaignDate | null {
  return name ? toDate(name.match(ANY_DATE_RE)) : null;
}

export function isBrandCampaign(name: string | null | undefined): boolean {
  return !!name && BRAND_CAMPAIGN_RE.test(name);
}

const amsterdamParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function amsterdamYmd(date: Date): { y: number; m: number; d: number } {
  const parts = amsterdamParts.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/**
 * Editions on the campaign date. Without a year in the name, take the first
 * occurrence on or after the ad started (campaigns run before their night).
 */
export function editionsOnCampaignDate<T extends { startsAt: Date }>(
  editions: T[],
  date: CampaignDate,
  anchor: Date | null,
): T[] {
  const onDay = editions.filter((e) => {
    const ymd = amsterdamYmd(e.startsAt);
    return ymd.m === date.m && ymd.d === date.d && (date.y == null || ymd.y === date.y);
  });
  const years = [...new Set(onDay.map((e) => amsterdamYmd(e.startsAt).y))].sort();
  if (years.length <= 1) return onDay;

  const from = (anchor ?? new Date()).getTime() - 7 * 86400000;
  const upcoming = onDay
    .filter((e) => e.startsAt.getTime() >= from)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const year = upcoming[0]
    ? amsterdamYmd(upcoming[0].startsAt).y
    : years[years.length - 1]!;
  return onDay.filter((e) => amsterdamYmd(e.startsAt).y === year);
}
