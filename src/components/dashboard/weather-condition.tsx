import { cn } from "@/lib/utils";
import type { ClassifiedWeather } from "@/lib/weather/classify";

const KIND_CLASS: Record<ClassifiedWeather["kind"], string> = {
  heat: "wx-heat",
  cold_wet: "wx-cold_wet",
  wet: "wx-wet",
  cold: "wx-cold",
  windy: "wx-windy",
  ideal: "wx-ideal",
  ok: "wx-ok",
};

export function weatherPanelClass(kind: ClassifiedWeather["kind"]): string {
  return KIND_CLASS[kind];
}

export function WeatherCondition({
  wx,
  size = "md",
}: {
  wx: ClassifiedWeather;
  size?: "sm" | "md" | "lg";
}) {
  const rainPct = Math.min(100, (wx.precipMm / 20) * 100);

  return (
    <div
      className={cn(
        "min-w-0",
        size === "lg" && "space-y-2",
      )}
    >
      <p
        className={cn(
          "font-display leading-none tracking-[0.04em]",
          size === "lg" && "text-5xl sm:text-6xl",
          size === "md" && "text-2xl",
          size === "sm" && "text-lg",
        )}
      >
        {wx.tempMaxC != null ? `${Math.round(wx.tempMaxC)}°` : "—"}
      </p>
      <p
        className={cn(
          "font-medium text-text",
          size === "sm" ? "text-xs" : "text-sm",
        )}
      >
        {wx.label}
      </p>
      <p className="text-xs text-text-muted">
        {wx.sky}
        {wx.precipMm >= 0.5 ? ` · ${wx.precipMm.toFixed(wx.precipMm >= 10 ? 0 : 1)} mm` : " · droog"}
      </p>
      {wx.precipMm >= 0.5 && size !== "sm" && (
        <div className="mt-1.5 h-1 w-full max-w-[8rem] bg-black/10 dark:bg-white/15">
          <div
            className="wx-rain h-full bg-info"
            style={{ width: `${Math.max(8, rainPct)}%` }}
          />
        </div>
      )}
    </div>
  );
}
