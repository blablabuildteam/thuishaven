import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSalesContextBundle } from "@/lib/dashboard/sales-context";
import { festivalWeatherTone } from "@/lib/weather/festival-score";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Context · Weer & festivals" };
export const dynamic = "force-dynamic";

export default async function DashboardContextPage() {
  const bundle = await getSalesContextBundle();
  const maxTickets = Math.max(...bundle.days.map((d) => d.tickets), 1);

  return (
    <div>
      <SectionHeader
        eyebrow="Context"
        title="Weer & festivals"
        description="Elke dag krijgt een festival-weer score (1–10): comfort voor outdoor. Hitte, zware regen, wind of kou in de zomer drukken de score."
        action={
          <Link
            href="/koppelingen"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Koppelingen →
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Gem. festival-weer"
          value={
            bundle.avgFestivalScore != null
              ? `${bundle.avgFestivalScore.toFixed(1)}/10`
              : "—"
          }
          hint="1 = slecht · 10 = ideaal outdoor"
          accent
        />
        <MetricCard
          label="Weerdagen"
          value={formatNumber(bundle.weatherSynced || bundle.days.length)}
          hint="Open-Meteo · Contactweg"
        />
        <MetricCard
          label="Andere events"
          value={formatNumber(bundle.festivals.length)}
          hint="Concurrentie / feestdagen"
        />
      </div>

      <p className="mb-6 text-sm leading-relaxed text-text-muted">
        {bundle.insight}
      </p>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Verkoop vs festival-weer
          </h2>
          <ul className="space-y-2">
            {bundle.days.map((d) => {
              const fw = d.festivalWeather;
              return (
                <li
                  key={d.date}
                  className="border border-border bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-text">{d.label}</p>
                        <StatusBadge tone={festivalWeatherTone(fw.band)}>
                          {fw.score}/10 · {fw.label}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {d.weatherLabel}
                        {d.tempMaxC != null
                          ? ` · ${d.tempMaxC.toFixed(0)}°C`
                          : ""}
                        {d.precipMm != null
                          ? ` · ${d.precipMm.toFixed(1)} mm`
                          : ""}
                        {d.windMaxMps != null
                          ? ` · ${d.windMaxMps.toFixed(0)} m/s`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-text-dim">
                        {fw.reasons.join(" · ")}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm text-text">
                      {formatNumber(d.tickets)}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 bg-bg-elevated">
                    <div
                      className="h-full bg-accent/80"
                      style={{ width: `${(d.tickets / maxTickets) * 100}%` }}
                    />
                  </div>
                  {d.note && (
                    <p className="mt-2 text-xs text-warn">Overlap: {d.note}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Concurrerende events
          </h2>
          <ul className="space-y-2">
            {bundle.festivals.map((f) => (
              <li key={f.id} className="border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text">{f.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {f.region} ·{" "}
                      {new Date(f.startsAt).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {f.endsAt
                        ? ` – ${new Date(f.endsAt).toLocaleDateString("nl-NL", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge
                    tone={f.type === "festival" ? "accent" : "neutral"}
                  >
                    {f.type === "festival"
                      ? "Festival"
                      : f.type === "holiday"
                        ? "Feestdag"
                        : "Overig"}
                  </StatusBadge>
                </div>
                {f.impactNote && (
                  <p className="mt-2 text-xs text-text-muted">{f.impactNote}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
