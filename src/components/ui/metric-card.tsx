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
        "rounded-sm border border-border bg-surface p-4 transition-colors hover:bg-surface-hover",
        accent && "border-accent/40 bg-accent-soft",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-3xl tracking-tight",
          accent ? "text-accent" : "text-text",
        )}
      >
        {value}
      </p>
      {(hint || trend) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          {trend && <span className="text-success">{trend}</span>}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
