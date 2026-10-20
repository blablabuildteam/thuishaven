import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CrmCompaniesTable,
  type WerklijstStage,
} from "@/components/outreach/crm-companies-table";
import { QueueSchedule } from "@/components/outreach/queue-schedule";
import { hasOutreachAiConfigured } from "@/lib/integrations/outreach";
import { listBatchesWithEmails } from "@/lib/outreach/batches";
import { listCrmRecords } from "@/lib/outreach/crm";
import { mailAngleFor } from "@/lib/outreach/mail-angle";
import { leadScore } from "@/lib/outreach/lead-score";
import { listQueueItems } from "@/lib/outreach/queue";
import {
  outreachTestSendBlockReason,
  resolveOutreachTestRecipient,
} from "@/lib/outreach/send-policy";

export const metadata = { title: "Werklijst" };
export const dynamic = "force-dynamic";

const STAGE_IDS: WerklijstStage[] = [
  "all",
  "nog",
  "check",
  "gepland",
  "verlopen",
  "verstuurd",
];

export default async function OutreachCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ stap?: string; prospect?: string }>;
}) {
  const [
    { rows },
    queueItems,
    { liveSendBlockReason, liveSendQuota, cadenceLabel, cadenceRationale },
    defaultTestTo,
    params,
  ] = await Promise.all([
    listCrmRecords(),
    listQueueItems(),
    listBatchesWithEmails(),
    resolveOutreachTestRecipient(),
    searchParams,
  ]);
  const initialStage = STAGE_IDS.includes(params.stap as WerklijstStage)
    ? (params.stap as WerklijstStage)
    : "all";
  const existingCustomers = rows.filter(
    (r) => !r.partner && r.existingCustomer,
  );
  const companies = rows
    .filter((r) => !r.partner && !r.existingCustomer)
    .map((row) => {
      const angle = mailAngleFor({
        status: row.status,
        existingCustomer: row.existingCustomer,
        doelgroepFit: row.doelgroepFit,
        doelgroepReason: row.doelgroepReason,
        anniversaryYears: row.anniversaryYears,
        nonMailing: row.nonMailing,
      });
      return {
        row,
        angle,
        score: leadScore({
          doelgroepFit: row.doelgroepFit,
          angleId: angle.id,
          jubileeYearsAway: angle.jubileeYearsAway,
          hasEmail: Boolean(row.email),
          hasContact: Boolean(row.decisionMakerName),
          openCount: row.openCount,
          clickCount: row.clickCount,
          replyCount: row.replyCount,
          status: row.status,
        }),
      };
    });
  const initialProspectId =
    params.prospect && companies.some((c) => c.row.id === params.prospect)
      ? params.prospect
      : null;

  const liveUnlocked = !liveSendBlockReason;
  const bouncePaused = Boolean(liveSendQuota?.bouncePause);
  const plannedCount = queueItems.filter(
    (i) => i.statusLabel === "gepland",
  ).length;

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 2"
        title="Werklijst"
        description="Alle bedrijven met de beste kansen bovenaan. Vink aan en laat mails schrijven; klik daarna op een mail om hem te lezen, te testen en in te plannen."
        action={
          <div className="flex flex-wrap items-center gap-2">
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
            <Link
              href="/outreach/lijst-bijwerken"
              className="text-sm text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              Lijst bijwerken
            </Link>
          </div>
        }
      />

      {!liveUnlocked ? (
        <p className="mb-5 text-sm text-text-muted">
          Echt versturen staat uit: mails gaan nu alleen als test naar team@.
          Je kunt alles voorbereiden en inplannen; een admin zet versturen aan.
        </p>
      ) : null}

      <section className="mb-10">
        {companies.length === 0 ? (
          <p className="border-y border-border py-6 text-sm text-text-muted">
            Nog geen bedrijven.{" "}
            <Link
              href="/outreach/lijst-bijwerken"
              className="text-accent underline"
            >
              Haal ze hier op
            </Link>
            .
          </p>
        ) : (
          <CrmCompaniesTable
            rows={companies}
            queueItems={queueItems}
            liveSendBlockReason={liveSendBlockReason}
            testSendBlockReason={outreachTestSendBlockReason()}
            defaultTestTo={defaultTestTo}
            aiConfigured={hasOutreachAiConfigured()}
            initialStage={initialStage}
            initialProspectId={initialProspectId}
          />
        )}
      </section>

      <details className="mb-10" open={initialStage === "gepland"}>
        <summary className="cursor-pointer font-display text-lg tracking-[0.06em] text-text">
          Planning per dag
          <span className="ml-2 font-sans text-sm tracking-normal text-text-dim">
            {plannedCount} ingepland
          </span>
        </summary>
        <div className="mt-4">
          <QueueSchedule
            cadenceLabel={cadenceLabel}
            cadenceRationale={cadenceRationale}
            items={queueItems}
          />
        </div>
      </details>

      {existingCustomers.length > 0 ? (
        <section className="border-t border-border pt-10">
          <h2 className="font-display text-lg tracking-[0.06em]">
            Al klant / niet mailen
          </h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            {existingCustomers.length} namen — niet in de mail-bulk.
          </p>
          <ul className="columns-1 gap-x-8 text-sm sm:columns-2 lg:columns-3">
            {existingCustomers.map((row) => (
              <li key={row.id} className="mb-1.5 break-inside-avoid">
                <Link
                  href={`/outreach/crm/${row.id}`}
                  className="text-text hover:text-accent"
                >
                  {row.companyName}
                </Link>
                <span className="ml-1.5 text-xs text-danger">
                  {row.excludedReason ?? "Niet mailen"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
