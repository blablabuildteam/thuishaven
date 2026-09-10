import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListFillWorkbench } from "@/components/outreach/list-fill-workbench";
import { listProspects } from "@/lib/outreach/data";
import { hasKvkConfig } from "@/lib/integrations/kvk";
import { hasApolloConfig } from "@/lib/integrations/apollo/client";
import { hasHunterConfig } from "@/lib/integrations/hunter/client";
import { nextApolloDiscoverPage } from "@/lib/outreach/apollo-page";

export const metadata = { title: "Lijst bijwerken" };
export const dynamic = "force-dynamic";

export default async function LijstBijwerkenPage() {
  const { rows } = await listProspects();
  const companies = rows.filter(
    (p) =>
      p.type === "company" &&
      p.status !== "excluded" &&
      p.source !== "exclusion_import",
  );
  const pendingKvk = companies.filter((p) => !p.kvkNumber).length;
  const pendingEmail = companies.filter((p) => p.website && !p.email).length;
  const pendingPeople = companies.filter((p) => !p.decisionMaker).length;
  const pendingHunter = companies.filter(
    (p) => p.decisionMaker && !p.decisionMakerEmail,
  ).length;
  const withEmail = companies.filter((p) => Boolean(p.email)).length;
  const apolloReady = hasApolloConfig();
  const hunterReady = hasHunterConfig();
  const kvkReady = hasKvkConfig();
  const apolloNextPage = await nextApolloDiscoverPage();

  return (
    <div>
      <SectionHeader
        eyebrow="Leads binnenhalen"
        title="Lijst bijwerken"
        description="Hier haal je zelf nieuwe bedrijven op en vul je e-mailadressen aan. Daarna mail je via Bedrijven → Mailen."
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
        pendingKvk={pendingKvk}
        pendingEmail={pendingEmail}
        pendingPeople={pendingPeople}
        pendingHunter={pendingHunter}
        apolloReady={apolloReady}
        hunterReady={hunterReady}
        kvkReady={kvkReady}
        apolloNextPage={apolloNextPage}
        companyCount={companies.length}
        withEmailCount={withEmail}
      />
    </div>
  );
}
