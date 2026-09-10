import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { AddProspectsForm } from "@/components/outreach/add-prospects-form";
import { DoelgroepActions } from "@/components/outreach/doelgroep-actions";
import { KvkEnrichForm } from "@/components/outreach/kvk-enrich-form";
import {
  listProspects,
  statusLabels,
  type OutreachProspect,
  type ProspectStatus,
} from "@/lib/outreach/data";
import { hasKvkConfig } from "@/lib/integrations/kvk";
import { hasApolloConfig } from "@/lib/integrations/apollo/client";
import { nextApolloDiscoverPage } from "@/lib/outreach/apollo-page";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Prospects" };
export const dynamic = "force-dynamic";

const toneFor = (status: ProspectStatus) => {
  if (status === "lead" || status === "replied") return "accent" as const;
  if (status === "unreachable" || status === "excluded") return "danger" as const;
  if (status === "opened" || status === "contacted") return "info" as const;
  return "neutral" as const;
};

function sourceLabel(source?: string) {
  switch (source) {
    case "bureau_import":
      return "Partner · niet cold";
    case "kvk":
      return "KvK";
    case "linkedin":
    case "linkedin_sales_nav":
      return "LinkedIn";
    case "website_scrape":
      return "Website";
    case "paste":
      return "Geplakte lijst";
    case "manual":
      return "Startlijst / handmatig";
    case "apollo":
      return "Apollo doelgroep";
    default:
      return source ?? "Onbekend";
  }
}

function ProspectTable({ rows }: { rows: OutreachProspect[] }) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Bedrijf</th>
            <th className="px-4 py-3 font-medium">Fit</th>
            <th className="px-4 py-3 font-medium">KvK</th>
            <th className="px-4 py-3 font-medium">Bron</th>
            <th className="px-4 py-3 font-medium">Medewerkers</th>
            <th className="px-4 py-3 font-medium">Jubileum</th>
            <th className="px-4 py-3 font-medium">E-mail</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className="border-b border-border last:border-0 hover:bg-surface/50"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/outreach/crm/${p.id}`}
                  className="text-text hover:text-accent"
                >
                  {p.companyName}
                </Link>
                <p className="text-xs text-text-dim">{p.city ?? p.sector ?? "—"}</p>
              </td>
              <td className="px-4 py-3">
                {p.doelgroepFit === "ja" ? (
                  <StatusBadge tone="success">fit</StatusBadge>
                ) : p.doelgroepFit === "nee" ? (
                  <StatusBadge tone="danger">{p.doelgroepReason ?? "nee"}</StatusBadge>
                ) : (
                  <span className="text-xs text-text-dim">
                    {p.doelgroepReason ?? "wacht op KvK"}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-muted">
                {p.kvkNumber ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-muted">
                {sourceLabel(p.source)}
              </td>
              <td className="px-4 py-3 font-mono text-text-muted">
                {p.employeeCount ? formatNumber(p.employeeCount) : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-accent">
                {p.anniversaryYears ? `${p.anniversaryYears} jr` : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-muted">
                {p.email ?? "nog niet"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge tone={toneFor(p.status)}>
                  {statusLabels[p.status]}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProspectsPage() {
  const { rows, source } = await listProspects();
  const companies = rows.filter((p) => p.type === "company");
  const partners = rows.filter(
    (p) => p.type === "agency" && p.source === "bureau_import",
  );
  const otherAgencies = rows.filter(
    (p) => p.type === "agency" && p.source !== "bureau_import",
  );
  const pendingKvk = companies.filter((p) => !p.kvkNumber).length;
  const fit = companies.filter((p) => p.doelgroepFit === "ja").length;
  const mailable = companies.filter((p) => Boolean(p.email)).length;
  const apolloReady = hasApolloConfig();
  const apolloNextPage = await nextApolloDiscoverPage();

  return (
    <div>
      <SectionHeader
        eyebrow="Lijsten"
        title="Prospects"
        description="Cold outreach = bedrijven 500–5.000 mdw in Amsterdam + 50 km. De 15 partnerbureaus van Reijner zijn bestaande relaties — die mail je niet koud."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={apolloReady ? "success" : "danger"}>
              {apolloReady ? "Apollo gekoppeld" : "Apollo-key ontbreekt"}
            </StatusBadge>
            <StatusBadge tone={hasKvkConfig() ? "success" : "danger"}>
              {hasKvkConfig() ? "KvK gekoppeld" : "KvK-key ontbreekt"}
            </StatusBadge>
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {source === "db" ? `${companies.length} bedrijven` : "Mockdata"}
            </StatusBadge>
          </div>
        }
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Doelgroep-bedrijven" value={formatNumber(companies.length)} />
        <MetricCard label="Past in doelgroep" value={formatNumber(fit)} accent />
        <MetricCard label="Nog te verrijken" value={formatNumber(pendingKvk)} />
        <MetricCard label="Met e-mail" value={formatNumber(mailable)} />
      </div>

      <DoelgroepActions
        pendingKvk={pendingKvk}
        apolloReady={apolloReady}
        apolloNextPage={apolloNextPage}
      />

      <AddProspectsForm />

      <KvkEnrichForm
        prospects={companies.map((p) => ({
          id: p.id,
          companyName: p.companyName,
          kvkNumber: p.kvkNumber,
        }))}
      />

      <section className="mb-10">
        <h2 className="mb-3 font-display text-2xl tracking-[0.06em]">
          Doelgroep
        </h2>
        {companies.length === 0 ? (
          <p className="border border-border bg-surface px-4 py-5 text-sm text-text-muted">
            Nog leeg. Haal de doelgroep op via Apollo (boven).
          </p>
        ) : (
          <ProspectTable rows={companies} />
        )}
      </section>

      {otherAgencies.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-2xl tracking-[0.06em]">
            Overige bureaus
          </h2>
          <ProspectTable rows={otherAgencies} />
        </section>
      ) : null}

      <section className="border border-border bg-surface p-4">
        <h2 className="font-display text-2xl tracking-[0.06em]">
          Partnerbureaus · niet cold mailen
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          {partners.length} namen van Reijner. Bestaande relatie — alleen zachte
          open-data later, niet deze cold-flow.{" "}
          <Link href="/outreach/uitsluitingen" className="text-accent underline">
            Niet mailen
          </Link>{" "}
          blokkeert overlap.
        </p>
      </section>
    </div>
  );
}
