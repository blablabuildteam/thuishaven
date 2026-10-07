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
    liveSendBlockReason,
    cadenceLabel,
    cadenceRationale,
    schedule,
  } = await listBatchesWithEmails();

  const queuedCount = batches
    .filter((b) => b.status !== "sent")
    .reduce((s, b) => s + b.mailCount, 0);

  const liveUnlocked = !liveSendBlockReason;

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 4 · review"
        title="Wachtrij"
        description="Bovenaan de planning (wanneer), daaronder de bakjes (wat + tekst + afzender)."
        action={
          <div className="flex flex-wrap gap-2">
            {liveUnlocked ? (
              <StatusBadge tone="success">Live send aan</StatusBadge>
            ) : (
              <StatusBadge tone="danger">Live send uit</StatusBadge>
            )}
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

      {!liveUnlocked && liveSendBlockReason ? (
        <p className="mb-4 text-xs text-text-dim">{liveSendBlockReason}</p>
      ) : null}

      <QueueSchedule
        cadenceLabel={cadenceLabel}
        cadenceRationale={cadenceRationale}
        schedule={schedule}
      />

      <BatchQueue
        batches={batches}
        liveSendBlockReason={liveSendBlockReason}
      />
    </div>
  );
}
