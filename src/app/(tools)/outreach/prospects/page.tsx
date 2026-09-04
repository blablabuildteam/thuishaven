import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  listProspects,
  statusLabels,
  type ProspectStatus,
} from "@/lib/outreach/data";
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
      return "Partnerlijst Reijner";
    case "kvk":
      return "KvK";
    case "linkedin":
    case "linkedin_sales_nav":
      return "LinkedIn";
    case "website_scrape":
      return "Website";
    case "manual":
      return "Handmatig";
    default:
      return source ?? "Onbekend";
  }
}

export default async function ProspectsPage() {
  const { rows, source } = await listProspects();

  return (
    <div>
      <SectionHeader
        eyebrow="Lijsten"
        title="Prospects"
        description="Nu vooral partnerbureaus uit Reijners import. Later komen hier KvK-bedrijven bij — bron zie je per rij."
        action={
          <StatusBadge tone={source === "db" ? "success" : "neutral"}>
            {source === "db" ? `${rows.length} uit DB` : "Mockdata"}
          </StatusBadge>
        }
      />

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Bedrijf</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Bron</th>
              <th className="px-4 py-3 font-medium">Sector</th>
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
                  <p className="text-text">{p.companyName}</p>
                  <p className="text-xs text-text-dim">
                    {p.city ?? (p.contacts?.length ? `${p.contacts.length} contacten` : "—")}
                  </p>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {p.type === "company" ? "Bedrijf" : "Bureau"}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-text-muted">
                    {sourceLabel(p.source)}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-muted">{p.sector ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-text-muted">
                  {p.employeeCount ? formatNumber(p.employeeCount) : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-accent">
                  {p.anniversaryYears ? `${p.anniversaryYears} jr` : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">
                  {p.email ?? "niet gevonden"}
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
    </div>
  );
}
