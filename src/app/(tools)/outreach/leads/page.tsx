import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { leads } from "@/lib/mock/outreach";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Lead routing"
        title="Warme leads"
        description="Positieve replies triggeren een notificatie naar het salesteam met volledige context. Later: CRM-koppeling."
      />

      <div className="space-y-3">
        {leads.map((lead) => (
          <article
            key={lead.id}
            className="border border-accent/30 bg-accent-soft/40 p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="accent">Lead</StatusBadge>
              {lead.notified && (
                <StatusBadge tone="success">Salesteam genotificeerd</StatusBadge>
              )}
            </div>
            <h2 className="mt-3 font-display text-xl tracking-tight">
              {lead.companyName}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
              {lead.summary}
            </p>
            <p className="mt-4 text-xs text-text-dim">
              {format(new Date(lead.createdAt), "d MMMM yyyy · HH:mm", {
                locale: nl,
              })}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
