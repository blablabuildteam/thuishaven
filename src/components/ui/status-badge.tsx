import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-surface-hover text-text-muted border-border",
  accent: "bg-accent text-bg border-accent",
  success: "bg-accent text-bg border-accent",
  warn: "bg-warn text-bg border-warn",
  danger: "bg-danger text-text border-danger",
  info: "bg-info/15 text-info border-info/40",
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
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-display text-xs tracking-[0.12em]",
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
