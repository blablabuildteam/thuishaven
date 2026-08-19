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
  const maxSold = Math.max(
    ...featured.map((b) => b.avgSold),
    impact.outdoor.avgSold,
    1,
  );
  const maxLast = Math.max(
    ...featured.map((b) => b.avgLastWeekSold ?? 0),
    1,
  );

  return (
    <section className={compact ? "mb-6" : "mb-8"}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-xl tracking-[0.03em] sm:text-2xl">
            {impact.verdict.title}
          </p>
          <p className="mt-1 text-xs text-text-dim">
            {impact.verdict.body}
            {impact.verdict.evidence ? ` · ${impact.verdict.evidence}` : ""}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 text-sm underline underline-offset-2 hover:text-text"
        >
          {compact ? "Weer →" : "Detail →"}
        </Link>
      </div>

      {featured.length > 0 && (
        <ul
          className={cn(
            "stagger grid gap-2",
            compact ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4 gap-3",
          )}
        >
          {featured.map((b) => (
            <li
              key={b.kind}
              className={cn(
                "border border-border p-3",
                weatherPanelClass(b.kind),
              )}
            >
              <p className="text-[11px] tracking-[0.12em] text-text-dim uppercase">
                {b.label}
              </p>
              <p className="mt-1 font-display text-2xl tracking-[0.02em]">
                {b.avgSold > 0 ? formatNumber(b.avgSold) : "—"}
              </p>
              <p className="text-[11px] text-text-muted">
                sold · n={b.n}
                {b.vsComfortPct != null
                  ? ` · ${b.vsComfortPct >= 0 ? "+" : ""}${formatPercent(b.vsComfortPct, 0)}`
                  : ""}
              </p>
              <div className="mt-2 h-0.5 bg-black/10 dark:bg-white/15">
                <div
                  className="h-full bg-text"
                  style={{
                    width: `${Math.round((b.avgSold / maxSold) * 100)}%`,
                  }}
                />
              </div>
              {b.avgLastWeekSold != null && (
                <p className="mt-2 text-[11px] text-text">
                  laatste week {formatNumber(b.avgLastWeekSold)}
                  <span
                    className="ml-1 inline-block h-1 w-8 align-middle bg-black/10 dark:bg-white/15"
                    aria-hidden
                  >
                    <span
                      className="block h-full bg-info"
                      style={{
                        width: `${Math.round((b.avgLastWeekSold / maxLast) * 100)}%`,
                      }}
                    />
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
