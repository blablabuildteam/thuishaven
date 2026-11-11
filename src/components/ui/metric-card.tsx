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
    <div className="th-panel p-4 sm:p-5">
      <p className="th-sticker text-[11px] text-text-dim">{label}</p>
      <p className="th-num mt-2 text-4xl leading-none text-text sm:text-5xl">
        <span className={cn(accent && "bg-highlight px-1 text-highlight-fg")}>
          {value}
        </span>
      </p>
      {(hint || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          {trend && <span className="font-semibold text-text">{trend}</span>}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
