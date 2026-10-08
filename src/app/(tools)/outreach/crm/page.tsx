import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { CrmCompaniesTable } from "@/components/outreach/crm-companies-table";
import { PipelineStatusBanner } from "@/components/outreach/pipeline-status-banner";
import { listCrmRecords } from "@/lib/outreach/crm";
import { mailAngleFor } from "@/lib/outreach/mail-angle";
import { leadScore } from "@/lib/outreach/lead-score";
import { computeOutreachPipelineStatus } from "@/lib/outreach/pipeline-status";

export const metadata = { title: "Bedrijven" };
export const dynamic = "force-dynamic";

export default async function OutreachCrmPage() {
  const { rows } = await listCrmRecords();
  const pipeline = computeOutreachPipelineStatus(rows);
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

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 2"
        title="Bedrijven"
        description="Funnel: bakje → klaar om te mailen → gegevens ontbreken → al verstuurd. Doel: iedereen een eerste mail. Klik een rij voor dossier."
        action={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm text-text-dim">
              {pipeline.totalCompanies} · {pipeline.readyToMail} klaar ·{" "}
              {pipeline.missingEmail + pipeline.incompleteButHasEmail} ontbreekt
            </p>
            <Link
              href="/outreach/lijst-bijwerken"
              className="text-sm text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              Lijst bijwerken
            </Link>
            <Link
              href="/outreach/emails"
              data-tour="crm-mailen"
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              Mailen →
            </Link>
          </div>
        }
      />

      <PipelineStatusBanner status={pipeline} />

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
          <CrmCompaniesTable rows={companies} />
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
