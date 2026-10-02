import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { BatchQueue } from "@/components/outreach/batch-queue";
import { QueueSchedule } from "@/components/outreach/queue-schedule";
import { listBatchesWithEmails } from "@/lib/outreach/batches";

export const metadata = { title: "Wachtrij" };
export const dynamic = "force-dynamic";

export default async function OutreachPlanningPage() {
  const {
    batches,
    unbatchedDrafts,
    liveSendBlockReason,
    cadenceLabel,
    cadenceRationale,
    schedule,
  } = await listBatchesWithEmails();

  const queuedCount = batches
    .filter((b) => b.status !== "sent")
    .reduce((s, b) => s + b.mailCount, 0);

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 3b · review"
        title="Wachtrij"
        description="Bovenaan de planning (wanneer), daaronder de bakjes (wat + tekst). Live versturen staat nog uit."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="danger">Live send uit</StatusBadge>
            <StatusBadge tone={queuedCount > 0 ? "accent" : "neutral"}>
              {queuedCount} in bakjes
            </StatusBadge>
            <Link
              href="/outreach/emails"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              ← Mailen
            </Link>
          </div>
        }
      />

      <QueueSchedule
        cadenceLabel={cadenceLabel}
        cadenceRationale={cadenceRationale}
        schedule={schedule}
        unbatchedCount={unbatchedDrafts.length}
      />

      <BatchQueue
        batches={batches}
        unbatchedDrafts={unbatchedDrafts}
        liveSendBlockReason={liveSendBlockReason}
      />
    </div>
  );
}
