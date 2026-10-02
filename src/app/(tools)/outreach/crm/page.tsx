import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { CrmCompaniesTable } from "@/components/outreach/crm-companies-table";
import { listCrmRecords } from "@/lib/outreach/crm";
import { mailAngleFor } from "@/lib/outreach/mail-angle";
import { leadScore } from "@/lib/outreach/lead-score";

export const metadata = { title: "Bedrijven" };
export const dynamic = "force-dynamic";

export default async function OutreachCrmPage() {
  const { rows, source } = await listCrmRecords();
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

  const mailable = companies.filter((c) =>
    ["jubileum", "seizoen", "algemeen", "funding", "recordjaar"].includes(
      c.angle.id,
    ),
  ).length;

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 2"
        title="Bedrijven"
        description="Wie nu de moeite waard is: signalen en leadscore. Klik een bedrijf open voor maillog en notities. Daarna → Mailen."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {companies.length} · {mailable} klaar
            </StatusBadge>
            <Link
              href="/outreach/lijst-bijwerken"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              ← Lijst bijwerken
            </Link>
            <Link
              href="/outreach/emails"
              data-tour="crm-mailen"
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              Volgende: Mailen →
            </Link>
          </div>
        }
      />

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
        <section className="border-t border-border pt-8">
          <h2 className="font-display text-lg tracking-[0.06em]">
            Al klant / niet mailen
          </h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            {existingCustomers.length} namen — zichtbaar, niet in de mail-bulk.
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
