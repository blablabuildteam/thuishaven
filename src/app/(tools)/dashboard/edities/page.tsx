import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { editions } from "@/lib/mock/dashboard";
import {
  RAW_PLATFORM_EVENTS,
  editionMappingSummary,
  matchEditions,
} from "@/lib/editions/normalize";
import { formatPercent } from "@/lib/utils";

export const metadata = { title: "Editie-mapping" };

const platformLabel: Record<string, string> = {
  weeztix: "Weeztix",
  resident_advisor: "Resident Advisor",
  appic: "Appic",
  ticketswap: "TicketSwap",
  internal: "Intern",
};

export default function EditiesPage() {
  const matches = matchEditions(RAW_PLATFORM_EVENTS, editions);
  const summary = editionMappingSummary(matches);

  return (
    <div>
      <SectionHeader
        eyebrow="Normalisatie"
        title="Editie-mapping"
        description="We halen eventnamen uit de platforms, normaliseren die, en koppelen automatisch op naam + datum. Jij reviewt alleen twijfelgevallen — geen handmatige spreadsheet nodig als eerste stap."
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Ruwe events" value={String(summary.total)} />
        <MetricCard
          label="Auto-gekoppeld"
          value={String(summary.autoLinked)}
          accent
        />
        <MetricCard label="Review nodig" value={String(summary.needsReview)} />
        <MetricCard label="Geen match" value={String(summary.unmatched)} />
      </div>

      <section className="mb-6 border border-border bg-surface p-4">
        <h2 className="mb-2 font-display text-2xl tracking-[0.06em]">
          Canonieke edities
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          Interne waarheid in onze database. Platforms mappen hiernaartoe.
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {editions.map((ed) => (
            <li key={ed.id} className="border border-border bg-bg px-3 py-3">
              <p className="font-display text-lg tracking-[0.06em]">{ed.name}</p>
              <p className="mt-1 font-mono text-[11px] text-text-dim">
                {ed.slug} · {ed.status}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Voorgestelde koppelingen
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="pb-3 font-medium">Platform</th>
                <th className="pb-3 font-medium">Ruwe naam</th>
                <th className="pb-3 font-medium">Genormaliseerd</th>
                <th className="pb-3 font-medium">Voorstel</th>
                <th className="pb-3 font-medium">Score</th>
                <th className="pb-3 font-medium">Redenen</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr
                  key={`${m.raw.platform}-${m.raw.externalId}`}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-3 text-text-muted">
                    {platformLabel[m.raw.platform]}
                  </td>
                  <td className="max-w-[180px] py-3 text-text">{m.raw.name}</td>
                  <td className="py-3 font-mono text-xs text-text-dim">
                    {m.normalizedName}
                  </td>
                  <td className="py-3">
                    {m.suggestedEditionName ? (
                      <span className="text-text">{m.suggestedEditionName}</span>
                    ) : (
                      <StatusBadge tone="warn">Handmatig</StatusBadge>
                    )}
                  </td>
                  <td className="py-3 font-mono text-accent">
                    {formatPercent(m.score * 100, 0)}
                  </td>
                  <td className="py-3 text-xs text-text-muted">
                    {m.reasons.join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
