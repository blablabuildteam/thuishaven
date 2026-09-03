import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listExclusions } from "@/lib/outreach/data";

export const metadata = { title: "Uitsluitingen" };
export const dynamic = "force-dynamic";

export default async function ExclusionsPage() {
  const { rows, source } = await listExclusions();

  return (
    <div>
      <SectionHeader
        eyebrow="Filter"
        title="Uitsluitingen"
        description="Bestaande klanten en no-go’s uit Reijners lijst. Deze bedrijven/bureaus worden niet benaderd."
        action={
          <StatusBadge tone={source === "db" ? "success" : "neutral"}>
            {rows.length} regels · {source}
          </StatusBadge>
        }
      />

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Bedrijf</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Reden</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 hover:bg-surface/50"
              >
                <td className="px-4 py-3 text-text">
                  {row.companyName ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">
                  {row.email ?? "—"}
                </td>
                <td className="px-4 py-3 text-text-muted">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
