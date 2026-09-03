import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listLeads } from "@/lib/outreach/data";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { rows, source } = await listLeads();

  return (
    <div>
      <SectionHeader
        eyebrow="Lead routing"
        title="Warme leads"
        description="Reijner + Yoram worden genotificeerd bij positieve interesse (tour, datum, capacity, bezichtiging). Nu: testsend naar team@."
        action={
          <StatusBadge tone={source === "db" ? "success" : "neutral"}>
            {source === "db" ? "DB" : "Mock"}
          </StatusBadge>
        }
      />

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">Nog geen warme leads.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((lead) => (
            <article
              key={lead.id}
              className="border border-accent/30 bg-accent-soft/40 p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="accent">Lead</StatusBadge>
                {lead.notified && (
                  <StatusBadge tone="success">
                    Salesteam genotificeerd
                  </StatusBadge>
                )}
              </div>
              <h2 className="mt-3 font-display text-xl tracking-tight">
                {lead.companyName}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
                {lead.summary}
              </p>
              {lead.email && (
                <p className="mt-2 font-mono text-xs text-text-dim">
                  {lead.email}
                </p>
              )}
              <p className="mt-4 text-xs text-text-dim">
                {format(new Date(lead.createdAt), "d MMMM yyyy · HH:mm", {
                  locale: nl,
                })}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
