import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { AddProspectsForm } from "@/components/outreach/add-prospects-form";
import { DoelgroepActions } from "@/components/outreach/doelgroep-actions";
import { DoelgroepUniverse } from "@/components/outreach/doelgroep-universe";
import { KvkEnrichForm } from "@/components/outreach/kvk-enrich-form";
import {
  listProspects,
  statusLabels,
  type OutreachProspect,
  type ProspectStatus,
} from "@/lib/outreach/data";
import { mailAngleFor } from "@/lib/outreach/mail-angle";
import { hasKvkConfig } from "@/lib/integrations/kvk";
import { hasApolloConfig } from "@/lib/integrations/apollo/client";
import { hasHunterConfig } from "@/lib/integrations/hunter/client";
import { nextApolloDiscoverPage } from "@/lib/outreach/apollo-page";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Lijst vullen" };
export const dynamic = "force-dynamic";

const toneFor = (status: ProspectStatus) => {
  if (status === "lead" || status === "replied") return "accent" as const;
  if (status === "unreachable" || status === "excluded") return "danger" as const;
  if (status === "opened" || status === "contacted") return "info" as const;
  return "neutral" as const;
};

function angleTone(id: string) {
  if (id === "jubileum") return "accent" as const;
  if (id === "algemeen") return "success" as const;
  if (id === "past_niet" || id === "niet_mailen") return "danger" as const;
  return "neutral" as const;
}

function sourceLabel(source?: string) {
  switch (source) {
    case "bureau_import":
      return "Partner · niet cold";
    case "exclusion_import":
      return "Al klant / niet mailen";
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
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Bedrijf</th>
            <th className="px-4 py-3 font-medium">Mailhoek</th>
            <th className="px-4 py-3 font-medium">Match</th>
            <th className="px-4 py-3 font-medium">KvK</th>
            <th className="px-4 py-3 font-medium">Bron</th>
            <th className="px-4 py-3 font-medium">Medewerkers</th>
            <th className="px-4 py-3 font-medium">E-mail</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const angle = mailAngleFor({
              status: p.status,
              doelgroepFit: p.doelgroepFit,
              doelgroepReason: p.doelgroepReason,
              anniversaryYears: p.anniversaryYears,
            });
            return (
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
                  <StatusBadge tone={angleTone(angle.id)}>{angle.label}</StatusBadge>
                  <p className="mt-1 max-w-[200px] text-xs text-text-dim">
                    {angle.detail}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {p.doelgroepFit === "ja" ? (
                    <StatusBadge tone="success">fit</StatusBadge>
                  ) : p.doelgroepFit === "nee" ? (
                    <StatusBadge tone="danger">
                      {p.doelgroepReason ?? "nee"}
                    </StatusBadge>
                  ) : (
                    <span className="text-xs text-text-dim">
                      {p.doelgroepReason ?? "wacht op check"}
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
                <td className="px-4 py-3 font-mono text-xs text-text-muted">
                  {p.email ?? "nog niet"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={toneFor(p.status)}>
                    {statusLabels[p.status]}
                  </StatusBadge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProspectsPage() {
  const { rows, source } = await listProspects();
  const companies = rows
    .filter(
      (p) =>
        p.type === "company" &&
        p.status !== "excluded" &&
        p.source !== "exclusion_import",
    )
    .slice()
    .sort((a, b) => {
      const aa = mailAngleFor({
        status: a.status,
        doelgroepFit: a.doelgroepFit,
        doelgroepReason: a.doelgroepReason,
        anniversaryYears: a.anniversaryYears,
      });
      const bb = mailAngleFor({
        status: b.status,
        doelgroepFit: b.doelgroepFit,
        doelgroepReason: b.doelgroepReason,
        anniversaryYears: b.anniversaryYears,
      });
      return aa.rank - bb.rank || a.companyName.localeCompare(b.companyName, "nl");
    });
  const doNotMail = rows.filter(
    (p) =>
      p.source === "exclusion_import" ||
      (p.type === "company" && p.status === "excluded"),
  );
  const otherAgencies = rows.filter(
    (p) => p.type === "agency" && p.source !== "bureau_import",
  );
  const pendingKvk = companies.filter((p) => !p.kvkNumber).length;
  const pendingEmail = companies.filter((p) => p.website && !p.email).length;
  const fit = companies.filter((p) => p.doelgroepFit === "ja").length;
  const fitNo = companies.filter((p) => p.doelgroepFit === "nee").length;
  const mailable = companies.filter((p) => Boolean(p.email)).length;
  const pendingPeople = companies.filter((p) => !p.decisionMaker).length;
  const pendingHunter = companies.filter(
    (p) => p.decisionMaker && !p.decisionMakerEmail,
  ).length;
  const apolloReady = hasApolloConfig();
  const hunterReady = hasHunterConfig();
  const apolloNextPage = await nextApolloDiscoverPage();

  return (
    <div>
      <SectionHeader
        eyebrow="Beheer"
        title="Lijst vullen"
        description="Admin: bedrijven ophalen en verrijken. Reijner/Yoram werken vooral via Bedrijven → Mailen."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={apolloReady ? "success" : "danger"}>
              {apolloReady ? "Apollo gekoppeld" : "Apollo-key ontbreekt"}
            </StatusBadge>
            <StatusBadge tone={hunterReady ? "success" : "neutral"}>
              {hunterReady ? "Hunter gekoppeld" : "Hunter optioneel"}
            </StatusBadge>
            <StatusBadge tone={hasKvkConfig() ? "success" : "danger"}>
              {hasKvkConfig() ? "KvK gekoppeld" : "KvK-key ontbreekt"}
            </StatusBadge>
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {source === "db" ? `${companies.length} op lijst` : "Mockdata"}
            </StatusBadge>
          </div>
        }
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Op de lijst"
          value={formatNumber(companies.length)}
          hint="Alles wat we hebben opgehaald"
        />
        <MetricCard
          label="Klaar om te mailen"
          value={formatNumber(fit)}
          accent
          hint="Passen in grootte + regio"
        />
        <MetricCard
          label="Past niet (label)"
          value={formatNumber(fitNo)}
          hint="Zichtbaar, niet in bulk"
        />
        <MetricCard label="Met e-mail" value={formatNumber(mailable)} />
      </div>

      <DoelgroepUniverse compact listedCount={companies.length} />

      <DoelgroepActions
        pendingKvk={pendingKvk}
        pendingEmail={pendingEmail}
        pendingPeople={pendingPeople}
        pendingHunter={pendingHunter}
        apolloReady={apolloReady}
        hunterReady={hunterReady}
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
          Bedrijven
        </h2>
        <p className="mb-3 text-sm text-text-muted">
          Jubileum dit/volgend jaar → jubileum-mail. Anders (ook jubileum over
          2–4 jaar) → algemeen feest. “Past niet” blijft zichtbaar met label.
        </p>
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
          Partnerbureaus · later
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          De 15 partners staan voor nu uit de workflow. Soft open-data campagne
          komt later.
          {doNotMail.length > 0
            ? ` · ${doNotMail.length} bestaande klanten staan in Bedrijven onder “Al klant / niet mailen”.`
            : null}
        </p>
      </section>
    </div>
  );
}
