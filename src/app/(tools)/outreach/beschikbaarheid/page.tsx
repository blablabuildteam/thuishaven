import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { AvailabilityAdmin } from "@/components/outreach/availability-admin";
import {
  getPublicAvailabilityUrl,
  listAvailabilityDays,
} from "@/lib/outreach/availability";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

export default async function BeschikbaarheidPage() {
  const { days, source } = await listAvailabilityDays();
  const open = days.filter((d) => d.status === "available");
  const liveUrl = getPublicAvailabilityUrl();

  return (
    <div>
      <SectionHeader
        eyebrow="Agenda"
        title="Beschikbaarheid beheren"
        description="Zet open dagen klaar. Diezelfde data zie je op de publieke pagina die je deelt in mails."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="accent">{open.length} open</StatusBadge>
            <Link
              href="/beschikbaar"
              target="_blank"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Live preview →
            </Link>
          </div>
        }
      />

      <div className="mb-6 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        <p className="font-medium text-text">Deelbare link</p>
        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block break-all font-mono text-xs text-accent underline-offset-2 hover:underline"
        >
          {liveUrl}
        </a>
      </div>

      <AvailabilityAdmin initialDays={days} source={source} />
    </div>
  );
}
