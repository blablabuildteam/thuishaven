import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import {
  loadEditionBundle,
  loadMailLift,
  loadWeatherImpact,
} from "@/lib/cache/dashboard";
import {
  periodClaims,
  weekdayClaims,
} from "@/lib/editions/cohort-claims";
import { formatNumber } from "@/lib/utils";
import { hasDatabase } from "@/lib/db/client";
import { listOpenDashboardAlerts } from "@/lib/integrations/alerts";
import { WeatherStory } from "@/components/dashboard/weather-story";
import {
  EventsBoard,
  type EventsBoardRow,
} from "@/components/dashboard/events-board";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [bundle, impact, mailLift, openAlerts] = await Promise.all([
    loadEditionBundle(),
    loadWeatherImpact(),
    loadMailLift().catch(() => null),
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
      capacity: r.capacity,
      sellThrough: r.sellThrough,
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
        description={`${formatNumber(bundle.totals.editions)} edities · fill = Weeztix-cap (uitverkocht vs resttickets)`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/weer"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Weer
            </Link>
            <Link
              href="/dashboard/marketing"
              className="bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              Mailings
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
        <ul className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {cohortBits.map((c) => (
            <li key={c.title} title={c.evidence}>
              <span className="font-medium">{c.title}</span>
              <span className="ml-2 text-text-muted">{c.body}</span>
            </li>
          ))}
        </ul>
      )}

      {bundle.artistLeaderboard.length > 0 && (
        <section className="mb-6">
          <p className="mb-2 text-[10px] font-medium tracking-[0.14em] text-text-dim uppercase">
            Top draw
          </p>
          <ul className="flex flex-wrap gap-2">
            {bundle.artistLeaderboard.slice(0, 5).map((a) => (
              <li
                key={a.artist}
                className="border border-border px-2.5 py-1.5 text-sm"
              >
                {a.artist}
                <span className="ml-2 text-xs text-text-dim">
                  ~{formatNumber(a.avgSold)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <EventsBoard rows={boardRows} />
    </div>
  );
}
