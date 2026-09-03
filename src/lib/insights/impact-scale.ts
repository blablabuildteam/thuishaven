/** Shared 1–5 impact scale for competition pressure and organic marketing. */

export type ImpactLevel = 1 | 2 | 3 | 4 | 5;

export const IMPACT_LEVELS: ImpactLevel[] = [1, 2, 3, 4, 5];

export const IMPACT_BAR_HEIGHTS = [
  "h-1",
  "h-1.5",
  "h-2",
  "h-2.5",
  "h-3",
] as const;

export function isHighImpact(level: ImpactLevel): boolean {
  return level >= 4;
}

export function isLowImpact(level: ImpactLevel): boolean {
  return level <= 2;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function meanImpactPeer(
  buckets: Record<ImpactLevel, number[]>,
  levels: ImpactLevel[],
): number | null {
  return mean(levels.flatMap((l) => buckets[l]));
}

/** Competition: 1 = rustig (groen) → 5 = zeer druk (rood). */
export function competitionBarFill(level: ImpactLevel): string {
  switch (level) {
    case 1:
      return "bg-success";
    case 2:
      return "bg-info";
    case 3:
      return "bg-warn";
    case 4:
      return "bg-[color-mix(in_srgb,var(--warn)_35%,var(--danger))]";
    case 5:
      return "bg-danger";
  }
}

/** Organic: 1 = weinig push → 5 = sterke push (groen). */
export function organicBarFill(level: ImpactLevel): string {
  switch (level) {
    case 1:
      return "bg-text-dim";
    case 2:
      return "bg-text-muted";
    case 3:
      return "bg-accent";
    case 4:
      return "bg-[color-mix(in_srgb,var(--accent)_25%,var(--success))]";
    case 5:
      return "bg-success";
  }
}
