import { IMPACT_BAR_HEIGHTS, type ImpactLevel } from "@/lib/insights/impact-scale";
import { cn } from "@/lib/utils";

export function ImpactLevelBars({
  level,
  fill,
  label,
}: {
  level: ImpactLevel;
  fill: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex h-3 shrink-0 items-end gap-0.5"
      title={label}
      aria-label={label}
      role="img"
    >
      {IMPACT_BAR_HEIGHTS.map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-1 rounded-[1px]",
            h,
            i < level ? fill : "bg-border",
          )}
        />
      ))}
    </span>
  );
}
