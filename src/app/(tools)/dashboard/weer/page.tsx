import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { weatherPanelClass } from "@/components/dashboard/weather-condition";
import { loadWeatherImpact } from "@/lib/cache/dashboard";
import { formatNumber, formatPercent } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { formatDayShort } from "@/lib/time/amsterdam";

export const metadata = { title: "Weer" };
export const dynamic = "force-dynamic";

export default async function WeatherPage() {
  const impact = await loadWeatherImpact();
  const featured = impact.outdoor.buckets.filter((b) =>
    ["wet", "heat", "ideal", "cold"].includes(b.kind),
  );

  return (
    <div>
      <SectionHeader
        eyebrow="Weer"
        title={`Vanaf ${impact.fromYear}`}
        description="Eventdag: °C en regen naast sold. Outdoor mei–sept."
        action={
          <Link
            href="/dashboard"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Events
          </Link>
        }
      />

      <p className="mb-2 font-display text-2xl tracking-[0.02em] sm:text-3xl">
        {impact.verdict.title}
      </p>
      <p className="mb-8 text-sm text-text-muted">
        {impact.verdict.body}
        {impact.verdict.evidence ? ` · ${impact.verdict.evidence}` : ""}
      </p>

      {featured.length > 0 && (
        <ul className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((b) => (
            <li
              key={b.kind}
              className={cn(
                "border border-border p-4",
                weatherPanelClass(b.kind),
              )}
            >
              <p className="text-[11px] tracking-[0.12em] text-text-dim uppercase">
                {b.label}
              </p>
              <p className="mt-2 font-display text-3xl">
                {formatNumber(b.avgSold)}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                gem. sold · n={b.n}
                {b.vsComfortPct != null
                  ? ` · ${b.vsComfortPct >= 0 ? "+" : ""}${formatPercent(b.vsComfortPct, 0)}`
                  : ""}
              </p>
              {b.avgLastWeekSold != null && (
                <p className="mt-2 text-xs text-text">
                  Laatste week {formatNumber(b.avgLastWeekSold)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="mb-1 font-display text-xl tracking-[0.03em]">
          Zwaarste dagen
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          Koud, nat of te heet — met sold en laatste week.
        </p>
        <ul className="divide-y divide-border border-y border-border">
          {impact.extremes.map((e) => (
            <li
              key={e.editionId}
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-3 px-2 py-3 sm:px-3",
                weatherPanelClass(e.weather.kind),
              )}
            >
              <div className="min-w-0">
                <p className="text-[11px] text-text-dim">
                  {formatDayShort(e.day)} {e.day.slice(0, 4)} ·{" "}
                  {e.weather.label}
                </p>
                <p className="truncate font-medium">
                  {e.headliner ?? e.name}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {e.weather.summary}
                  {e.lastWeekSold != null
                    ? ` · wk ${formatNumber(e.lastWeekSold)}`
                    : ""}
                </p>
              </div>
              <p className="font-display text-2xl">{formatNumber(e.sold)}</p>
            </li>
          ))}
          {!impact.extremes.length && (
            <li className="px-3 py-6 text-sm text-text-muted">
              Nog te weinig extreme dagen in {impact.fromYear}+ (
              {impact.coverage.withWeather}/{impact.coverage.editions} met weer).
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
