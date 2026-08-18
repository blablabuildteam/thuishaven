import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { InsightsChatPanel } from "@/components/dashboard/insights-chat-panel";
import { getInsightsSnapshot } from "@/lib/insights/data";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const snap = await getInsightsSnapshot();
  const avgOpen =
    snap.brevo.totalSent > 0
      ? (snap.brevo.totalOpens / snap.brevo.totalSent) * 100
      : null;

  return (
    <div>
      <SectionHeader
        eyebrow="Data"
        title="Insights"
        description="Live cijfers uit jullie sync + chat tegen die data. Geen mock."
        action={
          <Link
            href="/koppelingen"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Koppelingen →
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Brevo campagnes"
          value={formatNumber(snap.brevo.campaigns)}
          accent
        />
        <MetricCard
          label="Totaal sent"
          value={formatNumber(snap.brevo.totalSent)}
        />
        <MetricCard
          label="Gem. open rate"
          value={avgOpen != null ? formatPercent(avgOpen) : "—"}
          hint="opens / sent"
        />
        <MetricCard
          label="Weeztix edities"
          value={formatNumber(snap.weeztix.editions)}
          hint={`${formatNumber(snap.weeztix.sold)} sold in inventory`}
        />
        <MetricCard
          label="RA listings"
          value={formatNumber(snap.ra.listings)}
          hint={`${formatNumber(snap.ra.linked)} gekoppeld · attending ≠ sold`}
        />
      </div>

      {snap.notes.length > 0 && (
        <ul className="mb-6 space-y-1 text-sm text-text-muted">
          {snap.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Top open rates
          </h2>
          <ul className="space-y-2 border border-border bg-surface p-3">
            {snap.brevo.top.length === 0 && (
              <li className="text-sm text-text-muted">Nog geen campagnes.</li>
            )}
            {snap.brevo.top.map((c) => (
              <li
                key={c.name + c.sent}
                className="border-b border-border/70 pb-2 last:border-0 last:pb-0"
              >
                <p className="text-sm text-text">{c.name}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {c.openRate != null ? formatPercent(c.openRate) : "—"} open ·{" "}
                  {formatNumber(c.sent)} sent
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-3">
          <h2 className="mb-3 text-sm font-medium tracking-[0.08em] text-text-dim uppercase">
            Vraag de data
          </h2>
          <InsightsChatPanel />
          <p className="mt-2 text-xs text-text-dim">
            Vereist OPENAI_API_KEY. Antwoorden gebruiken alleen de snapshot hierboven.
          </p>
        </section>
      </div>
    </div>
  );
}
