import Link from "next/link";
import { EventInsightsList } from "@/components/dashboard/event-insights-list";
import { LoadedSection } from "@/components/dashboard/dashboards-skeletons";
import {
  loadEventInsights,
  loadEventInsightsFresh,
  invalidateEventInsightsCache,
} from "@/lib/insights/event-insights";
import {
  listUpcomingPlatformTakedowns,
  upcomingPlatformTakedownStatus,
} from "@/lib/integrations/alerts";
import { alertEventTitle, formatEventDateShort } from "@/lib/integrations/alerts/event-label";
import { hasDatabase } from "@/lib/db/client";
import { cn } from "@/lib/utils";

export async function ConflictsBanner() {
  if (!hasDatabase()) return null;

  const { takedowns, upcomingEditionCount } =
    await upcomingPlatformTakedownStatus().catch(() => ({
      takedowns: [],
      upcomingEditionCount: 0,
    }));

  if (takedowns.length > 0) {
    const n = takedowns.length;

    return (
      <LoadedSection>
        <div
          className={cn(
            "mb-6 border border-warn/50 bg-warn/10 px-3 py-2.5 text-sm",
          )}
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">
                {n === 1
                  ? "1 komend event is uitverkocht, maar nog te koop elders"
                  : `${n} komende events zijn uitverkocht, maar nog te koop elders`}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                3000 tickets verkocht, terwijl Appic of Resident Advisor nog
                tickets toont
              </p>
            </div>
            <Link
              href="/dashboard/alerts"
              className="shrink-0 text-text-muted hover:text-text"
            >
              Naar alerts →
            </Link>
          </div>
          <ul className="mt-2 space-y-1 border-t border-warn/20 pt-2">
            {takedowns.map((event) => (
              <li key={event.editionId} className="text-xs text-text-muted">
                <span className="font-medium text-text">
                  {formatEventDateShort(event.startsAt)} ·{" "}
                  {alertEventTitle(event.editionName)}
                </span>
                <span className="before:content-['_·_']">
                  {event.channels.map((c) => c.channelLabel).join(" + ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </LoadedSection>
    );
  }

  return (
    <LoadedSection>
      <div className="mb-6 border border-border bg-surface px-3 py-2.5 text-sm">
        <p className="font-medium text-text-muted">
          {upcomingEditionCount === 0
            ? "Geen komende events om te checken op sold-out mismatch"
            : "Geen sold-out mismatch — Appic en Resident Advisor zijn in orde bij komende events"}
        </p>
        {upcomingEditionCount > 0 && (
          <p className="mt-0.5 text-xs text-text-dim">
            {upcomingEditionCount}{" "}
            {upcomingEditionCount === 1 ? "komend event" : "komende events"}{" "}
            gecontroleerd (Weeztix vol, Appic/RA nog open)
          </p>
        )}
      </div>
    </LoadedSection>
  );
}

export async function EventInsightsSection() {
  const takedownsPromise = hasDatabase()
    ? listUpcomingPlatformTakedowns().catch(() => [])
    : Promise.resolve([]);

  let eventInsights: Awaited<ReturnType<typeof loadEventInsights>> = [];
  try {
    eventInsights = await loadEventInsights({ limit: 80 });
  } catch (err) {
    console.error("[EventInsightsSection] load failed", err);
  }

  // Only recover when cache/DB truly have nothing (avoid full sync on transient errors).
  if (eventInsights.length === 0 && hasDatabase()) {
    try {
      eventInsights = await loadEventInsightsFresh({
        limit: 80,
        skipEnsure: true,
        skipWeather: true,
      });
      if (eventInsights.length === 0) {
        const { syncWeeztixReadOnly } = await import(
          "@/lib/integrations/weeztix/sync"
        );
        await syncWeeztixReadOnly({ includeStats: true });
        await invalidateEventInsightsCache();
        eventInsights = await loadEventInsightsFresh({
          limit: 80,
          skipEnsure: true,
        });
      }
    } catch (err) {
      console.error("[EventInsightsSection] recovery failed", err);
    }
  }

  const upcomingInsights = eventInsights
    .filter((e) => e.status === "upcoming")
    .sort((a, b) => a.day.localeCompare(b.day));
  const pastInsights = eventInsights
    .filter((e) => e.status === "past")
    .sort((a, b) => b.day.localeCompare(a.day));

  const takedowns = await takedownsPromise;
  const platformAlerts = takedowns.map((t) => ({
    editionId: t.editionId,
    channels: t.channels.map((c) => c.channel),
  }));

  return (
    <LoadedSection className="mb-12">
      <EventInsightsList
        upcoming={upcomingInsights}
        past={pastInsights}
        platformAlerts={platformAlerts}
      />
    </LoadedSection>
  );
}
