import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListFillWorkbench } from "@/components/outreach/list-fill-workbench";
import { listProspects } from "@/lib/outreach/data";
import { hasKvkConfig } from "@/lib/integrations/kvk";
import { hasApolloConfig } from "@/lib/integrations/apollo/client";
import { hasHunterConfig } from "@/lib/integrations/hunter/client";
import { nextApolloDiscoverPage } from "@/lib/outreach/apollo-page";
import { countAutoFillPending } from "@/lib/outreach/auto-fill";

export const metadata = { title: "Lijst bijwerken" };
export const dynamic = "force-dynamic";

export default async function LijstBijwerkenPage() {
  const { rows } = await listProspects();
  const pending = await countAutoFillPending();
  const companies = rows.filter(
    (p) =>
      p.type === "company" &&
      p.status !== "excluded" &&
      p.source !== "exclusion_import",
  );
  const pipeline = companies.filter((p) => p.doelgroepFit !== "nee");
  const withEmail = pipeline.filter((p) => Boolean(p.email)).length;
  const outOfRegion = companies.filter((p) =>
    Boolean(p.doelgroepReason?.startsWith("Buiten regio")),
  ).length;
  const apolloReady = hasApolloConfig();
  const hunterReady = hasHunterConfig();
  const kvkReady = hasKvkConfig();
  const apolloNextPage = await nextApolloDiscoverPage();

  return (
    <div>
      <SectionHeader
        eyebrow="Leads binnenhalen"
        title="Lijst bijwerken"
        description="Eén knop vult KvK, contactpersonen en e-mails automatisch aan. Geen handmatig LinkedIn-werk nodig."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={apolloReady ? "success" : "danger"}>
              {apolloReady ? "Ophalen klaar" : "Ophalen niet gekoppeld"}
            </StatusBadge>
            <Link
              href="/outreach/crm"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Naar bedrijven →
            </Link>
          </div>
        }
      />

      <ListFillWorkbench
        pendingKvk={pending.kvk}
        pendingEmail={pending.website}
        pendingPeople={pending.people}
        pendingHunter={pending.hunter}
        pendingHeadcount={pending.headcount}
        apolloReady={apolloReady}
        hunterReady={hunterReady}
        kvkReady={kvkReady}
        apolloNextPage={apolloNextPage}
        companyCount={pipeline.length}
        withEmailCount={withEmail}
        outOfRegionCount={outOfRegion}
      />
    </div>
  );
}
