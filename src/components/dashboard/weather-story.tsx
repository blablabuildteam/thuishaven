import Link from "next/link";
import { formatNumber, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { WeatherImpact } from "@/lib/weather/impact";
import { weatherPanelClass } from "@/components/dashboard/weather-condition";

export function WeatherStory({
  impact,
  href = "/dashboard/weer",
  compact = false,
}: {
  impact: WeatherImpact;
  href?: string;
  compact?: boolean;
}) {
  const featured = impact.outdoor.buckets.filter((b) =>
    ["wet", "heat", "ideal", "cold"].includes(b.kind),
  );

  if (!featured.length && !impact.verdict.title) return null;

  return (
    <section className={compact ? "mb-6" : "mb-8"}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg tracking-[0.03em] sm:text-xl">
            {impact.verdict.title}
          </p>
          <p className="mt-0.5 text-xs text-text-dim">
            Weer · outdoor vanaf {impact.fromYear}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 text-sm underline underline-offset-2 hover:text-text"
        >
          Detail →
        </Link>
      </div>

      {featured.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {featured.map((b) => (
            <li
              key={b.kind}
              className={cn(
                "border border-border px-3 py-2.5",
                weatherPanelClass(b.kind),
              )}
            >
              <p className="text-[10px] tracking-[0.12em] text-text-dim uppercase">
                {b.label}
              </p>
              <p className="mt-0.5 font-display text-xl">
                {b.avgSold > 0 ? formatNumber(b.avgSold) : "—"}
              </p>
              <p className="text-[11px] text-text-muted">
                {b.vsComfortPct != null
                  ? `${b.vsComfortPct >= 0 ? "+" : ""}${formatPercent(b.vsComfortPct, 0)} · n=${b.n}`
                  : `n=${b.n}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
