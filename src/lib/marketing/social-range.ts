export const SOCIAL_RANGES = ["30d", "3m", "6m", "1y"] as const;

export type SocialRange = (typeof SOCIAL_RANGES)[number];

export const SOCIAL_RANGE_LABEL: Record<SocialRange, string> = {
  "30d": "30D",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
};

export const DEFAULT_SOCIAL_RANGE: SocialRange = "30d";

export function isSocialRange(value: string | null | undefined): value is SocialRange {
  return SOCIAL_RANGES.includes(value as SocialRange);
}

/** Start of the selected lookback window (UTC midnight-ish via Date math). */
export function socialRangeSince(
  range: SocialRange,
  now: Date = new Date(),
): Date {
  const since = new Date(now.getTime());
  switch (range) {
    case "30d":
      since.setDate(since.getDate() - 30);
      break;
    case "3m":
      since.setMonth(since.getMonth() - 3);
      break;
    case "6m":
      since.setMonth(since.getMonth() - 6);
      break;
    case "1y":
      since.setFullYear(since.getFullYear() - 1);
      break;
  }
  return since;
}
