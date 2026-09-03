import { Suspense } from "react";
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
