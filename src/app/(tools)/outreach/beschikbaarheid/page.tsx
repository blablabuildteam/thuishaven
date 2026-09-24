import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/outreach");
  }

  const { days, source } = await listAvailabilityDays();
  const open = days.filter((d) => d.status === "available");
  const liveUrl = getPublicAvailabilityUrl();

  return (
    <div>
      <SectionHeader
        eyebrow="Agenda · admin"
        title="Beschikbaarheid"
        description="Klik op dagen in de kalender. Open dagen verschijnen op de publieke link in mails."
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

      <p className="mb-6 text-sm text-text-muted">
        Deelbare link:{" "}
        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-accent underline-offset-2 hover:underline"
        >
          {liveUrl}
        </a>
      </p>

      <AvailabilityAdmin initialDays={days} source={source} />
    </div>
  );
}
