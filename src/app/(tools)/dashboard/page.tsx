import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkCampaignsToEditions } from "@/lib/editions/link-campaigns";
import { getEditionAnalysisBundle } from "@/lib/editions/analysis";
import { festivalWeatherTone } from "@/lib/weather/festival-score";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

/**
 * Event-first dashboard: elke rij = één Thuishaven-editie
 * met factoren die we naast verkoop leggen.
 */
export default async function DashboardPage() {
  try {
    await linkCampaignsToEditions({ persist: true, minConfidence: 0.55 });
  } catch (e) {
    console.error("campaign link", e);
  }

  const bundle = await getEditionAnalysisBundle({ limit: 150 });

  return (
    <div>
      <SectionHeader
        eyebrow="Event-based"
        title="Events"
        description="Eén rij per editie. Verkoop plus factoren: weer, artiest, prijs, concurrentie, mail. Social (IG) volgt als die koppeling live is."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/insights"
              className="bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              Insights
            </Link>
            <Link
              href="/koppelingen"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Bronnen
            </Link>
          </div>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Events in view"
          value={formatNumber(bundle.totals.editions)}
          accent
        />
        <MetricCard
          label="Sold"
          value={formatNumber(bundle.totals.totalSold)}
        />
        <MetricCard
          label="Mails gekoppeld"
          value={formatNumber(bundle.totals.campaignsLinked)}
        />
        <MetricCard
          label="Gem. weer op eventdag"
          value={
            bundle.totals.avgWeather != null
              ? `${bundle.totals.avgWeather.toFixed(1)}/10`
              : "—"
          }
          hint="Alleen op editiedagen"
        />
      </div>

      {bundle.lessons.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Inzichten
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {bundle.lessons.slice(0, 4).map((l) => (
              <li key={l.id} className="border border-border bg-surface p-4">
                <p className="text-sm font-medium text-text">{l.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                  {l.body}
                </p>
                <p className="mt-2 text-[11px] text-text-dim">{l.evidence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bundle.recommendations.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Recommendations
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {bundle.recommendations.map((l) => (
              <li
                key={l.id}
                className="border-l-[3px] border-l-highlight border border-border bg-surface p-4"
              >
                <p className="text-sm font-medium text-text">{l.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                  {l.body}
                </p>
                <p className="mt-2 text-[11px] text-text-dim">{l.evidence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Factoren per event
          </h2>
          <p className="text-xs text-text-dim">
            Weer = score op de eventdag · Mail = gekoppelde Brevo · Social = nog
            open
          </p>
        </div>

        <div className="overflow-x-auto border border-border bg-surface">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
              <tr>
                <th className="px-3 py-3 font-medium">Event</th>
                <th className="px-3 py-3 font-medium">Sold</th>
                <th className="px-3 py-3 font-medium">Prijs</th>
                <th className="px-3 py-3 font-medium">Weer</th>
                <th className="px-3 py-3 font-medium">Artiest</th>
                <th className="px-3 py-3 font-medium">Mail</th>
                <th className="px-3 py-3 font-medium">Concurrentie</th>
                <th className="px-3 py-3 font-medium">Social</th>
              </tr>
            </thead>
            <tbody>
              {bundle.rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/70 last:border-0"
                >
                  <td className="max-w-[240px] px-3 py-3">
                    <p className="truncate font-medium text-text">
                      {r.headliner ?? r.name}
                    </p>
                    <p className="text-xs text-text-dim">
                      {r.day}
                      {r.kind !== "regular"
                        ? ` · ${r.kind.replace(/_/g, " ")}`
                        : ""}
                      {r.sellThrough != null
                        ? ` · ${formatPercent(r.sellThrough, 0)} vol`
                        : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {r.sold > 0 ? formatNumber(r.sold) : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-text-muted">
                    {r.avgPriceEur != null && r.avgPriceEur > 0
                      ? formatCurrency(r.avgPriceEur)
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    {r.weather ? (
                      <StatusBadge tone={festivalWeatherTone(r.weather.band)}>
                        {r.weather.score}/10
                      </StatusBadge>
                    ) : (
                      <span className="text-text-dim">—</span>
                    )}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-3 text-text-muted">
                    {r.artists.slice(0, 2).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-3 text-text-muted">
                    {r.campaigns.length ? (
                      <span title={r.campaigns.map((c) => c.name).join(", ")}>
                        {r.campaigns.length}×
                        {r.campaigns[0]?.openRate != null
                          ? ` · ${formatPercent(r.campaigns[0].openRate, 0)}`
                          : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-3 text-xs text-text-dim">
                    {r.competingFestivals[0] ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge tone="neutral">Soon</StatusBadge>
                  </td>
                </tr>
              ))}
              {!bundle.rows.length && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-sm text-text-muted"
                  >
                    Nog geen edities. Sync Weeztix via{" "}
                    <Link href="/koppelingen" className="underline">
                      Bronnen
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {bundle.artistLeaderboard.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Artiesten · gemiddelde sold (≥2 events)
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bundle.artistLeaderboard.slice(0, 9).map((a) => (
              <li
                key={a.artist}
                className="flex items-center justify-between border border-border bg-surface px-3 py-2"
              >
                <span className="text-sm text-text">{a.artist}</span>
                <span className="font-mono text-sm text-text-muted">
                  {formatNumber(a.avgSold)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
