import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { prospects, statusLabels, type ProspectStatus } from "@/lib/mock/outreach";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Prospects" };

const toneFor = (status: ProspectStatus) => {
  if (status === "lead" || status === "replied") return "accent" as const;
  if (status === "unreachable" || status === "excluded") return "danger" as const;
  if (status === "opened" || status === "contacted") return "info" as const;
  return "neutral" as const;
};

export default function ProspectsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Pipeline"
        title="Prospects"
        description="KvK + LinkedIn + website-extractie. Bedrijven (jubilea) en event bureaus in één lijst — filterbaar per type."
      />

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Bedrijf</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Sector</th>
              <th className="px-4 py-3 font-medium">Medewerkers</th>
              <th className="px-4 py-3 font-medium">Jubileum</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => (
              <tr
                key={p.id}
                className="border-b border-border last:border-0 hover:bg-surface/50"
              >
                <td className="px-4 py-3">
                  <p className="text-text">{p.companyName}</p>
                  <p className="text-xs text-text-dim">{p.city}</p>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {p.type === "company" ? "Bedrijf" : "Bureau"}
                </td>
                <td className="px-4 py-3 text-text-muted">{p.sector}</td>
                <td className="px-4 py-3 font-mono text-text-muted">
                  {p.employeeCount
                    ? formatNumber(p.employeeCount)
                    : "—"}
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
