import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { PipelineStatusBanner } from "@/components/outreach/pipeline-status-banner";
import { QueueList } from "@/components/outreach/queue-list";
import { QueueSchedule } from "@/components/outreach/queue-schedule";
import { hasOutreachAiConfigured } from "@/lib/integrations/outreach";
import { listBatchesWithEmails } from "@/lib/outreach/batches";
import { getOutreachPipelineStatus } from "@/lib/outreach/pipeline-status";
import { listQueueItems } from "@/lib/outreach/queue";

export const metadata = { title: "Wachtrij" };
export const dynamic = "force-dynamic";

export default async function OutreachPlanningPage() {
  const [
    {
      liveSendBlockReason,
      liveSendQuota,
      cadenceLabel,
      cadenceRationale,
      schedule,
    },
    pipeline,
    queueItems,
  ] = await Promise.all([
    listBatchesWithEmails(),
    getOutreachPipelineStatus(),
    listQueueItems(),
  ]);

  const liveUnlocked = !liveSendBlockReason;
  const bouncePaused = Boolean(liveSendQuota?.bouncePause);
  const plannedCount = queueItems.filter((i) => i.scheduledAt).length;
  const aiOk = hasOutreachAiConfigured();

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 4 · review"
        title="Wachtrij"
        description="Eén lijst: concepten + te checken. Open een rij om tekst/afzender te wijzigen. Selecteer → Plan in → Activeer verzenden (typ “wachtrij”). Wijzigen zet auto-send weer uit."
        action={
          <div className="flex flex-wrap gap-2">
            {bouncePaused ? (
              <StatusBadge tone="danger">Bounce-pause</StatusBadge>
            ) : liveUnlocked ? (
              <StatusBadge tone="success">Live send aan</StatusBadge>
            ) : (
              <StatusBadge tone="danger">Live send uit</StatusBadge>
            )}
            {liveSendQuota ? (
              <StatusBadge tone="neutral">
                {liveSendQuota.sentToday}/{liveSendQuota.dailyCap} vandaag
              </StatusBadge>
            ) : null}
            <StatusBadge tone={queueItems.length > 0 ? "accent" : "neutral"}>
              {queueItems.length} in lijst
            </StatusBadge>
            {plannedCount > 0 ? (
              <StatusBadge tone="info">{plannedCount} gepland</StatusBadge>
            ) : null}
            {!aiOk ? (
              <StatusBadge tone="warn">Geen AI-key</StatusBadge>
            ) : null}
            <Link
              href="/outreach/emails"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              ← Mailen
            </Link>
          </div>
        }
      />

      <PipelineStatusBanner status={pipeline} />

      {!liveUnlocked && liveSendBlockReason ? (
        <p className="mb-4 text-xs text-text-dim">{liveSendBlockReason}</p>
      ) : null}

      <QueueSchedule
        cadenceLabel={cadenceLabel}
        cadenceRationale={cadenceRationale}
        schedule={schedule}
      />

      <section className="mb-12">
        <h2 className="mb-4 font-display text-lg tracking-[0.06em]">
          Alle mails
        </h2>
        <QueueList
          items={queueItems}
          liveSendBlockReason={liveSendBlockReason}
          liveSendQuota={liveSendQuota}
          aiConfigured={aiOk}
        />
      </section>
    </div>
  );
}
