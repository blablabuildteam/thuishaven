import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { linkCampaignsToEditions } from "@/lib/editions/link-campaigns";
import { getEditionAnalysisBundle } from "@/lib/editions/analysis";
import { getMailLiftByEdition } from "@/lib/editions/mail-lift";
import {
  periodClaims,
  weekdayClaims,
} from "@/lib/editions/cohort-claims";
import { formatNumber } from "@/lib/utils";
import { hasDatabase } from "@/lib/db/client";
import { listOpenDashboardAlerts } from "@/lib/integrations/alerts";
import { getWeatherImpact } from "@/lib/weather/impact";
import { WeatherStory } from "@/components/dashboard/weather-story";
import {
  EventsBoard,
  type EventsBoardRow,
} from "@/components/dashboard/events-board";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  try {
    await linkCampaignsToEditions({ persist: true, minConfidence: 0.55 });
  } catch (e) {
    console.error("campaign link", e);
  }

  const [bundle, impact, mailLift, openAlerts] = await Promise.all([
    getEditionAnalysisBundle({ limit: 150 }),
    getWeatherImpact({ fromYear: 2025, sync: true }),
    getMailLiftByEdition({ limit: 80 }).catch(() => null),
    hasDatabase()
      ? listOpenDashboardAlerts().catch(() => ({
          ra: [],
          ticketswap: [],
          conflicts: [],
        }))
      : Promise.resolve({ ra: [], ticketswap: [], conflicts: [] }),
  ]);

  const mailByEdition = new Map(
    (mailLift?.editions ?? []).map((e) => [e.editionId, e]),
  );
  const conflicts = openAlerts.conflicts;

  const boardRows: EventsBoardRow[] = bundle.rows.map((r) => {
    const mail = mailByEdition.get(r.id);
    return {
      id: r.id,
      day: r.day,
      name: r.name,
      headliner: r.headliner,
      artists: r.artists,
      format: r.format,
      weekday: r.weekday,
      year: r.year,
      periods: r.periods,
      sold: r.sold,
      lastWeekSold: r.lastWeekSold,
      mailOrdersAfter:
        mail && mail.totalOrdersAfterMails > 0
          ? mail.totalOrdersAfterMails
          : null,
      brevoClickOrders:
        mail && mail.brevoClickOrders > 0 ? mail.brevoClickOrders : null,
      weather: r.weatherClass,
    };
  });

  const cohortBits = [
    ...weekdayClaims(bundle.rows),
    ...periodClaims(bundle.rows),
  ].slice(0, 2);

  return (
    <div>
      <SectionHeader
        eyebrow="Events"
        title="Events"
        description={`${formatNumber(bundle.totals.editions)} edities · ${formatNumber(bundle.totals.totalSold)} sold`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/weer"
              className="bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              Weer
            </Link>
            <Link
              href="/dashboard/insights"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Insights
            </Link>
          </div>
        }
      />

      {conflicts.length > 0 && (
        <Link
          href="/dashboard/alerts"
          className={`mb-5 flex items-center justify-between gap-3 border px-3 py-2 text-sm ${
            conflicts.some((c) => c.kind === "overbooking")
              ? "border-danger/50 bg-danger/5"
              : "border-warn/50 bg-warn/10"
          }`}
        >
          <span className="font-medium">
            {conflicts.length} sold-out · secundair nog open
          </span>
          <span className="text-text-muted">Alerts →</span>
        </Link>
      )}

      <WeatherStory impact={impact} compact />

      {cohortBits.length > 0 && (
        <ul className="mb-6 flex flex-wrap gap-3 text-sm">
          {cohortBits.map((c) => (
            <li
              key={c.title}
              className="border-l-2 border-highlight pl-3"
              title={c.evidence}
            >
              <span className="font-medium text-text">{c.title}</span>
              <span className="ml-2 text-text-muted">{c.body}</span>
            </li>
          ))}
        </ul>
      )}

      {bundle.artistLeaderboard.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
            Draw · ≥2 edities
          </h2>
          <ul className="flex flex-wrap gap-2">
            {bundle.artistLeaderboard.slice(0, 5).map((a) => (
              <li
                key={a.artist}
                className="border border-border bg-surface px-3 py-2"
              >
                <span className="text-sm font-medium">{a.artist}</span>
                <span className="ml-2 font-mono text-xs text-text-muted">
                  ~{formatNumber(a.avgSold)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <EventsBoard rows={boardRows} totalSold={bundle.totals.totalSold} />
    </div>
  );
}
