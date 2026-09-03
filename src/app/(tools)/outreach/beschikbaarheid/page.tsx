import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import {
  AvailabilityCalendar,
  AvailabilityLegend,
} from "@/components/outreach/availability-calendar";
import { AvailabilityAdmin } from "@/components/outreach/availability-admin";
import {
  formatEuro,
  listAvailabilityDays,
} from "@/lib/outreach/availability";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = { title: "Beschikbaarheid" };
export const dynamic = "force-dynamic";

export default async function BeschikbaarheidPage() {
  const { days, source } = await listAvailabilityDays();
  const open = days.filter((d) => d.status === "available");
  const priceRange = open
    .map((d) => d.priceFrom)
    .filter((p): p is number => p != null);
  const min = priceRange.length ? Math.min(...priceRange) : 0;
  const max = priceRange.length ? Math.max(...priceRange) : 0;

  return (
    <div>
      <SectionHeader
        eyebrow="Venue agenda"
        title="Beschikbaarheid"
        description="Beheer open slots, eigen events, externe boekingen, gesloten dagen en dynamic pricing. Dezelfde data voedt de live link in outbound-mails."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="accent" pulse>
              {open.length} open
            </StatusBadge>
            <Link
              href="/beschikbaar"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Publieke preview →
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="border border-border bg-surface p-4">
          <p className="font-display text-sm tracking-[0.14em] text-text-muted">
            Open slots
          </p>
          <p className="mt-1 font-display text-3xl">{open.length}</p>
        </div>
        <div className="border border-border bg-surface p-4">
          <p className="font-display text-sm tracking-[0.14em] text-text-muted">
            Prijsrange
          </p>
          <p className="mt-1 font-display text-3xl">
            {priceRange.length
              ? `${formatEuro(min)}–${formatEuro(max)}`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-text-dim">excl. BTW · dynamic</p>
        </div>
        <div className="border border-border bg-surface p-4">
          <p className="font-display text-sm tracking-[0.14em] text-text-muted">
            Live URL in mails
          </p>
          <p className="mt-2 break-all font-mono text-xs text-accent">
            /beschikbaar
          </p>
          <p className="mt-1 text-xs text-text-dim">
            Bron: {source === "db" ? "database" : "mock"}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <AvailabilityAdmin initialDays={days} source={source} />
      </div>

      <div className="mb-6">
        <AvailabilityLegend />
      </div>

      <AvailabilityCalendar days={days} />
    </div>
  );
}
