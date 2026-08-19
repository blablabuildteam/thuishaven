import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { WeatherStory } from "@/components/dashboard/weather-story";
import {
  WeatherCondition,
  weatherPanelClass,
} from "@/components/dashboard/weather-condition";
import { getWeatherImpact } from "@/lib/weather/impact";
import { formatNumber } from "@/lib/utils";
import { formatDayShort } from "@/lib/time/amsterdam";
import { cn } from "@/lib/utils";

export const metadata = { title: "Weer" };
export const dynamic = "force-dynamic";

export default async function WeatherPage() {
  const impact = await getWeatherImpact({ fromYear: 2025, sync: true });

  return (
    <div>
      <SectionHeader
        eyebrow="Weer"
        title={`Vanaf ${impact.fromYear}`}
        description={`${impact.coverage.withWeather}/${impact.coverage.editions} edities · outdoor n=${impact.outdoor.n}`}
        action={
          <Link
            href="/dashboard"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Events
          </Link>
        }
      />

      <WeatherStory impact={impact} href="#dagen" />

      {impact.outdoor.buckets.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
            Buckets · sold / laatste week
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {impact.outdoor.buckets.map((b) => (
              <li
                key={b.kind}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto] items-baseline gap-3 px-3 py-3",
                  weatherPanelClass(b.kind),
                )}
              >
                <div>
                  <p className="font-medium">{b.label}</p>
                  <p className="text-[11px] text-text-dim">n={b.n}</p>
                </div>
                <p className="text-right">
                  <span className="font-display text-2xl">
                    {formatNumber(b.avgSold)}
                  </span>
                  <span className="block text-[10px] text-text-dim">sold</span>
                </p>
                <p className="text-right">
                  <span className="font-display text-2xl">
                    {b.avgLastWeekSold != null
                      ? formatNumber(b.avgLastWeekSold)
                      : "—"}
                  </span>
                  <span className="block text-[10px] text-text-dim">wk</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="dagen">
        <h2 className="mb-3 text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
          Koud / nat / heet
        </h2>
        <ul className="space-y-2">
          {impact.extremes.map((e) => (
            <li
              key={e.editionId}
              className={cn(
                "grid grid-cols-[1fr_auto] items-end gap-3 border border-border p-4",
                weatherPanelClass(e.weather.kind),
              )}
            >
              <div>
                <p className="text-[11px] text-text-dim">
                  {formatDayShort(e.day)} {e.day.slice(0, 4)}
                </p>
                <p className="mt-0.5 font-display text-xl tracking-[0.03em]">
                  {e.headliner ?? e.name}
                </p>
                <div className="mt-3">
                  <WeatherCondition wx={e.weather} size="md" />
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-3xl">{formatNumber(e.sold)}</p>
                <p className="text-[10px] text-text-dim">sold</p>
                {e.lastWeekSold != null && (
                  <p className="mt-1 text-xs text-text-muted">
                    wk {formatNumber(e.lastWeekSold)}
                  </p>
                )}
              </div>
            </li>
          ))}
          {!impact.extremes.length && (
            <li className="border border-border px-3 py-6 text-sm text-text-muted">
              Nog te weinig extreme dagen in {impact.fromYear}+.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
