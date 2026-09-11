import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { CrmCompaniesTable } from "@/components/outreach/crm-companies-table";
import { listCrmRecords } from "@/lib/outreach/crm";
import { mailAngleFor } from "@/lib/outreach/mail-angle";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Bedrijven" };
export const dynamic = "force-dynamic";

export default async function OutreachCrmPage() {
  const { rows, source } = await listCrmRecords();
  const existingCustomers = rows.filter(
    (r) => !r.partner && r.existingCustomer,
  );
  const companies = rows
    .filter((r) => !r.partner && !r.existingCustomer)
    .map((row) => ({
      row,
      angle: mailAngleFor({
        status: row.status,
        existingCustomer: row.existingCustomer,
        doelgroepFit: row.doelgroepFit,
        doelgroepReason: row.doelgroepReason,
        anniversaryYears: row.anniversaryYears,
      }),
    }))
    .sort(
      (a, b) =>
        a.angle.rank - b.angle.rank ||
        a.row.companyName.localeCompare(b.row.companyName, "nl"),
    );

  const mailable = companies.filter(
    (c) => c.angle.id === "jubileum" || c.angle.id === "algemeen",
  ).length;
  const jubileum = companies.filter((c) => c.angle.id === "jubileum").length;
  const incomplete = companies.filter(
    (c) => c.angle.id === "nog_checken" || c.row.incomplete,
  ).length;
  const missingMdw = companies.filter((c) => c.row.employeeCount == null).length;

  return (
    <div>
      <SectionHeader
        eyebrow="Lijst"
        title="Bedrijven"
        description="Zoek op naam, filter op mailkans (jubileum ≤16 mnd of cold mail). Medewerkers: hover voor Apollo/KvK-bron."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {companies.length} op de lijst
            </StatusBadge>
            <Link
              href="/outreach/lijst-bijwerken"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Lijst bijwerken →
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

      <div className="stagger mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Op de lijst" value={formatNumber(companies.length)} />
        <MetricCard
          label="Klaar om te mailen"
          value={formatNumber(mailable)}
          accent
          hint="Jubileum of cold mail"
        />
        <MetricCard
          label="Jubileum ≤16 mnd"
          value={formatNumber(jubileum)}
        />
        <MetricCard
          label="Nog aanvullen"
          value={formatNumber(incomplete)}
          hint={`${missingMdw} zonder bruikbare mdw`}
        />
      </div>

      <div className="mb-6 space-y-2 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        <p>
          <strong className="text-text">Waar komen bedrijven vandaan?</strong>{" "}
          Vooral via <em>Lijst bijwerken</em> (Apollo: midgroot + AMS-regio),
          plus handmatige namen. Uitsluitingen staan apart onderaan.
        </p>
        <p>
          <strong className="text-text">Medewerkers:</strong> Apollo =
          concern-schatting (voorkeur). KvK = vaak alleen de vestiging (soms
          5–20). Lage KvK telt <em>niet</em> meer als “te klein / past niet” —
          die worden “Onvolledig” tot er een Apollo- of handmatige schatting is.
        </p>
        <p>
          <strong className="text-text">Buiten Amsterdam:</strong> Apollo’s
          plaatsfilter is zacht; oude rijen zonder hard-filter zitten er nog in.
          Nieuwe batches skippen bekende buiten-plaatsen. Filter op{" "}
          <em>Buiten</em> of vul KvK/Apollo-plaats aan.
        </p>
      </div>

      <section className="mb-10">
        {companies.length === 0 ? (
          <p className="border border-border bg-surface px-4 py-5 text-sm text-text-muted">
            Nog geen bedrijven.{" "}
            <Link href="/outreach/lijst-bijwerken" className="text-accent underline">
              Haal ze hier op
            </Link>
            .
          </p>
        ) : (
          <CrmCompaniesTable rows={companies} />
        )}
      </section>

      {existingCustomers.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-2xl tracking-[0.06em]">
            Al klant / niet mailen
          </h2>
          <p className="mb-3 text-sm text-text-muted">
            {existingCustomers.length} namen — zichtbaar, niet in de mail-bulk.
          </p>
          <ul className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
            {existingCustomers.map((row) => (
              <li key={row.id} className="mb-1.5 break-inside-avoid">
                <Link
                  href={`/outreach/crm/${row.id}`}
                  className="text-sm text-text hover:text-accent"
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
