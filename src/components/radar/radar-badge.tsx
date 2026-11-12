import {
  RADAR_BADGE_BY_ID,
  type RadarBadgeId,
  type RadarBadgeTone,
} from "@/lib/radar/badge-defs";
import { cn } from "@/lib/utils";

const TONE: Record<RadarBadgeTone, string> = {
  home: "bg-accent text-accent-contrast",
  hot: "bg-danger-soft text-danger",
  new: "bg-highlight text-highlight-fg",
  good: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warn: "bg-warn/15 text-warn",
  muted: "border border-border text-text-muted",
};

export function RadarBadgePill({
  tone,
  children,
  title,
  className,
}: {
  tone: RadarBadgeTone;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function RadarBadge({ id }: { id: RadarBadgeId }) {
  const def = RADAR_BADGE_BY_ID.get(id);
  if (!def) return null;
  return (
    <RadarBadgePill tone={def.tone} title={def.hint}>
      {def.label}
    </RadarBadgePill>
  );
}

/** Three thin bars: momentum / fit / bookability (0–100). */
export function RadarScoreBars({
  momentum,
  fit,
  bookability,
}: {
  momentum: number | null;
  fit: number | null;
  bookability: number | null;
}) {
  const rows = [
    { key: "M", label: "Momentum", v: momentum, color: "bg-danger" },
    { key: "F", label: "Fit", v: fit, color: "bg-info" },
    { key: "B", label: "Bookable", v: bookability, color: "bg-success" },
  ];
  return (
    <div className="w-24 space-y-0.5" aria-hidden>
      {rows.map((r) => (
        <div
          key={r.key}
          className="flex items-center gap-1"
          title={`${r.label}: ${r.v ?? "—"}`}
        >
          <span className="w-2 text-[9px] text-text-dim">{r.key}</span>
          <div className="h-1 flex-1 bg-border">
            <div
              className={cn("h-1", r.color)}
              style={{ width: `${Math.max(0, Math.min(100, r.v ?? 0))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
