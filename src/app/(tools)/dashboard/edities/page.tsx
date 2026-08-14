import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkCampaignsToEditions } from "@/lib/editions/link-campaigns";
import { getEditionAnalysisBundle } from "@/lib/editions/analysis";
import { festivalWeatherTone } from "@/lib/weather/festival-score";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Edities · analyse" };
export const dynamic = "force-dynamic";

export default async function EditiesPage() {
  // Refresh mailing↔editie links before analysis
  try {
    await linkCampaignsToEditions({ persist: true, minConfidence: 0.55 });
  } catch (e) {
    console.error("campaign link", e);
  }

  const bundle = await getEditionAnalysisBundle({ limit: 100 });

  return (
    <div>
      <SectionHeader
        eyebrow="Analyse"
        title="Edities"
        description="Tickets, line-up, weer, mails en concurrentie per editie — met automatische lessen. Heuristieken, geen orakel."
        action={
          <Link
            href="/dashboard/insights"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Insights chat →
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Edities"
          value={formatNumber(bundle.totals.editions)}
          accent
        />
        <MetricCard
          label="Sold (view)"
          value={formatNumber(bundle.totals.totalSold)}
        />
        <MetricCard
          label="Mails gekoppeld"
          value={formatNumber(bundle.totals.campaignsLinked)}
          hint="Brevo ↔ editie"
        />
        <MetricCard
          label="Gem. weer"
          value={
            bundle.totals.avgWeather != null
              ? `${bundle.totals.avgWeather.toFixed(1)}/10`
              : "—"
          }
        />
      </div>

      {bundle.lessons.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Lessen
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {bundle.lessons.map((l) => (
              <li
                key={l.id}
                className="border border-border bg-surface p-4"
              >
                <p className="text-sm font-medium text-text">{l.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {l.body}
                </p>
                <p className="mt-2 text-[11px] text-text-dim">{l.evidence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Artiesten · avg sold
          </h2>
          <ul className="divide-y divide-border border border-border bg-surface">
            {bundle.artistLeaderboard.map((a) => (
              <li
                key={a.artist}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{a.artist}</p>
                  <p className="text-xs text-text-dim">
                    {a.editions} edities
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm">
                  {formatNumber(a.avgSold)}
                </p>
              </li>
            ))}
            {!bundle.artistLeaderboard.length && (
              <li className="px-4 py-6 text-sm text-text-muted">
                Nog te weinig herhaalde artiesten in de view.
              </li>
            )}
          </ul>
        </section>

        <section className="lg:col-span-3">
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Recent · stacked signalen
          </h2>
          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
                <tr>
                  <th className="px-3 py-3 font-medium">Editie</th>
                  <th className="px-3 py-3 font-medium">Sold</th>
                  <th className="px-3 py-3 font-medium">Weer</th>
                  <th className="px-3 py-3 font-medium">Mail</th>
                  <th className="px-3 py-3 font-medium">Context</th>
                </tr>
              </thead>
              <tbody>
                {bundle.rows.slice(0, 40).map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="max-w-[260px] px-3 py-3">
                      <p className="truncate text-text">
                        {r.headliner ?? r.name}
                      </p>
                      <p className="text-xs text-text-dim">
                        {r.day}
                        {r.artists.length > 1
                          ? ` · ${r.artists.slice(0, 3).join(", ")}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-mono">
                      {r.sold > 0 ? formatNumber(r.sold) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {r.weather ? (
                        <StatusBadge
                          tone={festivalWeatherTone(r.weather.band)}
                        >
                          {r.weather.score}/10
                        </StatusBadge>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-text-muted">
                      {r.campaigns.length
                        ? `${r.campaigns.length}× · ${
                            r.campaigns[0]?.openRate != null
                              ? formatPercent(r.campaigns[0].openRate)
                              : "—"
                          }`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-text-dim">
                      {[
                        r.kind !== "regular"
                          ? r.kind.replace(/_/g, " ")
                          : null,
                        r.competingFestivals[0] ?? null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
