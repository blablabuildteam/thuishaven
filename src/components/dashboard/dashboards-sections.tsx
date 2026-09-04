import Link from "next/link";
import { EventInsightsList } from "@/components/dashboard/event-insights-list";
import { LoadedSection } from "@/components/dashboard/dashboards-skeletons";
import {
  loadEventInsights,
  loadEventInsightsFresh,
  invalidateEventInsightsCache,
} from "@/lib/insights/event-insights";
import { listOpenDashboardAlerts } from "@/lib/integrations/alerts";
import { hasDatabase } from "@/lib/db/client";
import { cn } from "@/lib/utils";

export async function ConflictsBanner() {
  const openAlerts = hasDatabase()
    ? await listOpenDashboardAlerts().catch(() => null)
    : null;

  const conflicts = openAlerts?.conflicts ?? [];
  if (!conflicts.length) return null;

  return (
    <LoadedSection>
      <Link
        href="/dashboard/alerts"
        className={cn(
          "mb-6 flex flex-col gap-1 border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between",
          conflicts.some((c) => c.kind === "overbooking")
            ? "border-danger/50 bg-danger/5"
            : "border-warn/50 bg-warn/10",
        )}
      >
        <span>
          <span className="font-medium">
            {conflicts.length === 1
              ? "1 event is uitverkocht op Weeztix, maar nog te koop elders"
              : `${conflicts.length} events zijn uitverkocht op Weeztix, maar nog te koop elders`}
          </span>
          <span className="mt-0.5 block text-xs text-text-muted sm:mt-0 sm:ml-0 sm:inline sm:before:content-['_·_']">
            RA / TicketSwap / Appic Game verkopen nog — risico op overboeking of
            omzetlek
          </span>
        </span>
        <span className="shrink-0 text-text-muted">Naar alerts →</span>
      </Link>
    </LoadedSection>
  );
}

export async function EventInsightsSection() {
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

  return (
    <LoadedSection className="mb-12">
      <EventInsightsList upcoming={upcomingInsights} past={pastInsights} />
    </LoadedSection>
  );
}

