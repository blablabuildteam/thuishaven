import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  trend?: string;
  accent?: boolean;
};

export function MetricCard({
  label,
  value,
  hint,
  trend,
  accent = false,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-hover",
        accent && "border-accent bg-accent-soft",
      )}
    >
      <p className="font-display text-sm tracking-[0.16em] text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-4xl tracking-[0.02em]",
          accent ? "text-accent" : "text-text",
        )}
      >
        {value}
      </p>
      {(hint || trend) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          {trend && (
            <span className="font-display tracking-wide text-accent">
              {trend}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
