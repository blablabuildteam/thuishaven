import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSalesContextBundle } from "@/lib/dashboard/sales-context";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Context · Weer & festivals" };
export const dynamic = "force-dynamic";

export default async function DashboardContextPage() {
  const bundle = await getSalesContextBundle();
  const maxTickets = Math.max(...bundle.days.map((d) => d.tickets), 1);

  return (
    <div>
      <SectionHeader
        eyebrow="Dashboard"
        title="Weer & festivals"
        description="Externe factoren naast kaartverkoop — zodat je ziet of dip/piek samenhangt met regen of een groot ander event."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={bundle.hasDb ? "success" : "warn"}>
              {bundle.hasDb ? "DB live" : "Zonder DB"}
            </StatusBadge>
            <Link
              href="/koppelingen"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Koppelingen →
            </Link>
          </div>
        }
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Weerdagen gesync"
          value={formatNumber(bundle.weatherSynced || bundle.days.length)}
          hint="Open-Meteo · Amsterdam"
          accent
        />
        <MetricCard
          label="Festivals / feestdagen"
          value={formatNumber(bundle.festivals.length)}
          hint="Handmatige seed · later uitbreiden"
        />
        <MetricCard
          label="Ticketdagen in view"
          value={formatNumber(bundle.days.length)}
          hint="Mock verkoop × live weer"
        />
      </div>

      <p className="mb-6 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        {bundle.insight}
      </p>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <section className="border border-border bg-surface p-4">
          <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
            Verkoop vs weer
          </h2>
          <ul className="space-y-3">
            {bundle.days.map((d) => (
              <li key={d.date} className="border border-border bg-bg p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-sm tracking-[0.08em] text-text">
                      {d.label}
                    </p>
                    <p className="text-xs text-text-muted">
                      {d.weatherLabel}
                      {d.tempMaxC != null ? ` · ${d.tempMaxC.toFixed(0)}°C` : ""}
                      {d.precipMm != null
                        ? ` · ${d.precipMm.toFixed(1)} mm`
                        : ""}
                    </p>
                  </div>
                  <p className="font-display text-lg tracking-wide text-accent">
                    {formatNumber(d.tickets)}
                  </p>
                </div>
                <div className="h-2 bg-surface">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${(d.tickets / maxTickets) * 100}%` }}
                  />
                </div>
                {d.note && (
                  <p className="mt-2 text-xs text-warn">
                    Overlap: {d.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-border bg-surface p-4">
          <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
            Concurrerende events
          </h2>
          <ul className="space-y-3">
            {bundle.festivals.map((f) => (
              <li key={f.id} className="border border-border bg-bg p-3">
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
