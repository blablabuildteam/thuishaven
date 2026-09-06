import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { listLeads } from "@/lib/outreach/data";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Warme leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { rows, source } = await listLeads();

  return (
    <div>
      <SectionHeader
        eyebrow="Sales"
        title="Warme leads"
        description="Positieve replies (tour, datum, bezichtiging). Los van de follow-up queue op Resultaten — daar staan geopend-zonder-antwoord."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {source === "db" ? "DB" : "Mock"}
            </StatusBadge>
            <Link
              href="/outreach/analytics"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Resultaten →
            </Link>
          </div>
        }
      />

      {rows.length === 0 ? (
        <div className="border border-border bg-surface px-4 py-5 text-sm text-text-muted">
          <p className="font-medium text-text">Nog geen warme leads</p>
          <p className="mt-2">
            Komt er een positief antwoord in evenement@? Log die op{" "}
            <Link href="/outreach/analytics" className="text-accent underline">
              Resultaten → Reply loggen
            </Link>
            . Bij woorden als rondleiding / datum / interesse maken we hier
            automatisch een lead.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((lead) => (
            <article
              key={lead.id}
              className="border border-accent/30 bg-accent-soft/40 p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="accent">Warme lead</StatusBadge>
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
