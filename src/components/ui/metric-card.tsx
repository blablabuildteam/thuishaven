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
        "border border-border/80 bg-surface p-4",
        accent && "border-l-[3px] border-l-highlight",
      )}
    >
      <p className="text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-3xl tracking-[0.02em] sm:text-4xl",
          accent ? "text-text" : "text-text",
        )}
      >
        {value}
      </p>
      {(hint || trend) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          {trend && <span className="text-text">{trend}</span>}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
