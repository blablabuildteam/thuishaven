import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { QueueList } from "@/components/outreach/queue-list";
import { QueueSchedule } from "@/components/outreach/queue-schedule";
import { hasOutreachAiConfigured } from "@/lib/integrations/outreach";
import { listBatchesWithEmails } from "@/lib/outreach/batches";
import { listQueueItems } from "@/lib/outreach/queue";
import {
  outreachTestSendBlockReason,
  resolveOutreachTestRecipient,
} from "@/lib/outreach/send-policy";

export const metadata = { title: "Wachtrij" };
export const dynamic = "force-dynamic";

export default async function OutreachPlanningPage() {
  const [
    {
      liveSendBlockReason,
      liveSendQuota,
      cadenceLabel,
      cadenceRationale,
    },
    queueItems,
    defaultTestTo,
  ] = await Promise.all([
    listBatchesWithEmails(),
    listQueueItems(),
    resolveOutreachTestRecipient(),
  ]);

  const liveUnlocked = !liveSendBlockReason;
  const bouncePaused = Boolean(liveSendQuota?.bouncePause);
  const plannedCount = queueItems.filter(
    (i) => i.statusLabel === "gepland",
  ).length;
  const aiOk = hasOutreachAiConfigured();
  const testSendBlockReason = outreachTestSendBlockReason();

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 4"
        title="Wachtrij"
        description="Alle mails die klaarstaan. Open een bedrijf om de mail te lezen, aan te passen, te testen en in te plannen. Ingeplande mails gaan op hun moment vanzelf, zolang echt versturen aan staat."
        action={
          <div className="flex flex-wrap gap-2">
            {bouncePaused ? (
              <span title="Te veel mails kwamen terug (bounces). Versturen is tijdelijk gepauzeerd.">
                <StatusBadge tone="danger">Gepauzeerd door bounces</StatusBadge>
              </span>
            ) : liveUnlocked ? (
              <span title="Ingeplande mails gaan echt naar de bedrijven.">
                <StatusBadge tone="success">Echt versturen staat aan</StatusBadge>
              </span>
            ) : (
              <span title="Mails gaan nu alleen als test naar team@. Een admin zet echt versturen aan.">
                <StatusBadge tone="neutral">Echt versturen staat uit</StatusBadge>
              </span>
            )}
            {liveSendQuota && liveUnlocked ? (
              <span title="Zoveel mails mogen er per dag echt uit.">
                <StatusBadge tone="neutral">
                  {liveSendQuota.sentToday} van {liveSendQuota.dailyCap} vandaag
                </StatusBadge>
              </span>
            ) : null}
            <StatusBadge tone={queueItems.length > 0 ? "accent" : "neutral"}>
              {queueItems.length} in de wachtrij
            </StatusBadge>
            {plannedCount > 0 ? (
              <StatusBadge tone="info">{plannedCount} gepland</StatusBadge>
            ) : null}
            {!aiOk ? (
              <StatusBadge tone="neutral">Geen AI-key</StatusBadge>
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

      {!liveUnlocked ? (
        <p className="mb-4 text-sm text-text-muted">
          Echt versturen staat uit: mails gaan nu alleen als test naar team@.
          Je kunt alles voorbereiden en inplannen; een admin zet versturen aan.
        </p>
      ) : null}

      <section className="mb-12">
        <h2 className="mb-4 font-display text-lg tracking-[0.06em]">
          Alle mails
        </h2>
        <QueueList
          items={queueItems}
          liveSendBlockReason={liveSendBlockReason}
          liveSendQuota={liveSendQuota}
          aiConfigured={aiOk}
          defaultTestTo={defaultTestTo}
          testSendBlockReason={testSendBlockReason}
        />
      </section>

      <QueueSchedule
        cadenceLabel={cadenceLabel}
        cadenceRationale={cadenceRationale}
        items={queueItems}
      />
    </div>
  );
}
