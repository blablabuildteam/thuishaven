import { Suspense } from "react";
import { SectionHeader } from "@/components/ui/section-header";
import {
  ConflictsBanner,
  EventInsightsSection,
} from "@/components/dashboard/dashboards-sections";
import { InsightsChatWidget } from "@/components/dashboard/insights-chat-widget";
import {
  ConflictsSkeleton,
  EventInsightsSkeleton,
} from "@/components/dashboard/dashboards-skeletons";

export const metadata = { title: "Inzichten" };

export default async function InzichtenPage() {
  return (
    <div className="pb-24">
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

      <InsightsChatWidget
        comingSoon={process.env.VERCEL_ENV === "production"}
      />
    </div>
  );
}
