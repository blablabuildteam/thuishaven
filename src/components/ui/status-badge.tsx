import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-surface-hover text-text-muted border-border",
  accent: "bg-accent-soft text-accent border-accent/30",
  success: "bg-success/10 text-success border-success/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  info: "bg-info/10 text-info border-info/30",
} as const;

type StatusBadgeProps = {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  pulse?: boolean;
};

export function StatusBadge({
  children,
  tone = "neutral",
  pulse = false,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        tones[tone],
      )}
    >
      {pulse && (
        <span className="size-1.5 animate-pulse-soft rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
