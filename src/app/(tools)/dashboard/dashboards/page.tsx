import { Suspense } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import {
  AiSection,
  ClaimsSection,
  ConflictsBanner,
  CorrelationSection,
  CreativesSection,
  EventInsightsSection,
  MarketingSection,
  SalesSection,
  parseDashboardsScope,
} from "@/components/dashboard/dashboards-sections";
import {
  ClaimsSkeleton,
  ConflictsSkeleton,
  CorrelationSkeleton,
  CreativesSkeleton,
  EventInsightsSkeleton,
  MarketingSkeleton,
  SalesSkeleton,
} from "@/components/dashboard/dashboards-skeletons";

export const metadata = { title: "Inzichten" };
export const dynamic = "force-dynamic";

export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const params = await searchParams;
  const scope = parseDashboardsScope(params.scope);

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

      <Suspense fallback={<SalesSkeleton />}>
        <SalesSection scope={scope} />
      </Suspense>

      <Suspense fallback={<MarketingSkeleton />}>
        <MarketingSection />
      </Suspense>

      <Suspense fallback={<CorrelationSkeleton />}>
        <CorrelationSection />
      </Suspense>

      <Suspense fallback={<CreativesSkeleton />}>
        <CreativesSection />
      </Suspense>

      <Suspense fallback={<ClaimsSkeleton />}>
        <ClaimsSection />
      </Suspense>

      <AiSection />
    </div>
  );
}
