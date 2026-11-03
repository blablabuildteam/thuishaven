import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CrmCompaniesTable,
  type CrmRow,
  type WerklijstStage,
} from "@/components/outreach/crm-companies-table";
import { hasOutreachAiConfigured } from "@/lib/integrations/outreach";
import { loadLiveSendOverview } from "@/lib/outreach/batches";
import { listCrmRecords, type CrmRecord } from "@/lib/outreach/crm";
import { mailAngleFor } from "@/lib/outreach/mail-angle";
import { leadScoreForRecord } from "@/lib/outreach/lead-score";
import { listQueueItems } from "@/lib/outreach/queue";
import {
  outreachTestSendBlockReason,
  resolveOutreachTestRecipient,
} from "@/lib/outreach/send-policy";

export const metadata = { title: "Bedrijven" };
export const dynamic = "force-dynamic";

const STAGE_IDS: WerklijstStage[] = [
  "all",
  "nog",
  "check",
  "gepland",
  "verlopen",
  "verstuurd",
];

/** Only what the table needs — the full record is several times larger. */
function toClientRow(r: CrmRecord): CrmRow {
  return {
    id: r.id,
    companyName: r.companyName,
    website: r.website,
    status: r.status,
    email: r.email,
    city: r.city,
    kvkCity: r.kvkCity,
    apolloCity: r.apolloCity,
    inRegion: r.inRegion,
    employeeCount: r.employeeCount,
    apolloEmployeeCount: r.apolloEmployeeCount,
    linkedinEmployeeEstimate: r.linkedinEmployeeEstimate,
    kvkEmployeeCount: r.kvkEmployeeCount,
    anniversaryYears: r.anniversaryYears,
    lastTouchAt: r.lastTouchAt,
    kvkHeadcountOff: r.kvkHeadcountOff,
    mailCount: r.mailCount,
    queuedCount: r.queuedCount,
    draftCount: r.draftCount,
    openCount: r.openCount,
    clickCount: r.clickCount,
    replyCount: r.replyCount,
    lastSentAt: r.lastSentAt,
    lastVariantKey: r.lastVariantKey,
    searchLabel: r.searchLabel,
    incomplete: r.incomplete,
    decisionMakerName: r.decisionMakerName,
    contacts: r.contacts.map((c) => ({
      name: c.name,
      title: c.title,
      email: c.email,
      linkedinUrl: c.linkedinUrl,
      emailSource: c.emailSource,
    })),
    emailChecks: r.emailChecks,
    mailedEmails: r.mailedEmails,
    pendingEmails: r.pendingEmails,
  };
}

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
    loadLiveSendOverview(),
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
        row: toClientRow(row),
        angle,
        score: leadScoreForRecord(row, angle),
      };
    });
  const initialProspectId =
    params.prospect && companies.some((c) => c.row.id === params.prospect)
      ? params.prospect
      : null;

  const liveUnlocked = !liveSendBlockReason;
  const bouncePaused = Boolean(liveSendQuota?.bouncePause);

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 2"
        title="Bedrijven"
        description="Alle bedrijven in de doelgroep. Per bedrijf zie je de grootte en de gevonden personen. Vink aan als je mails wilt laten schrijven."
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
            cadenceLabel={cadenceLabel}
            cadenceRationale={cadenceRationale}
          />
        )}
      </section>

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
