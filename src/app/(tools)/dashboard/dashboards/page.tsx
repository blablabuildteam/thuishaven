import { Suspense } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import {
  AiSection,
  ConflictsBanner,
  EventInsightsSection,
} from "@/components/dashboard/dashboards-sections";
import {
  ConflictsSkeleton,
  EventInsightsSkeleton,
} from "@/components/dashboard/dashboards-skeletons";

export const metadata = { title: "Inzichten" };

export default async function DashboardsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Inzichten"
        title="Event-inzichten"
        description="Per event: kaartverkoop × social × mail × weer × concurrentie. Klik op een event voor de details."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Events
            </Link>
            <Link
              href="/dashboard/weeztix"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Tickets
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

      <Suspense fallback={<ConflictsSkeleton />}>
        <ConflictsBanner />
      </Suspense>

      <Suspense fallback={<EventInsightsSkeleton />}>
        <EventInsightsSection />
      </Suspense>

      <AiSection />
    </div>
  );
}
