import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { listRecentCampaigns } from "@/lib/insights/data";
import { formatNumber, formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Marketing" };

export default async function MarketingPage() {
  const campaigns = await listRecentCampaigns(24);
  const totalSent = campaigns.reduce((s, c) => s + (c.sent ?? 0), 0);
  const totalOpens = campaigns.reduce((s, c) => s + (c.opens ?? 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const openRate = totalSent > 0 ? (totalOpens / totalSent) * 100 : null;

  return (
    <div>
      <SectionHeader
        eyebrow="Marketing"
        title="E-mailcampagnes"
        description="Live Brevo-metrics uit jullie sync. Social volgt later."
        action={
          <Link
            href="/dashboard/insights"
            className="border border-border px-3 py-2 text-sm hover:border-text"
          >
            Insights & chat →
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Campagnes"
          value={formatNumber(campaigns.length)}
          accent
        />
        <MetricCard label="Sent" value={formatNumber(totalSent)} />
        <MetricCard
          label="Open rate"
          value={openRate != null ? formatPercent(openRate) : "—"}
          hint={`${formatNumber(totalClicks)} clicks`}
        />
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nog geen campagnes in de database. Sync via{" "}
          <Link href="/koppelingen" className="underline">
            Koppelingen
          </Link>{" "}
          of POST /api/integrations/brevo/campaigns.
        </p>
      ) : (
        <section className="border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-[11px] tracking-wider text-text-dim uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Campagne</th>
                  <th className="px-4 py-3 font-medium">Verzonden</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Opens</th>
                  <th className="px-4 py-3 font-medium">Clicks</th>
                  <th className="px-4 py-3 font-medium">Open %</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const sent = c.sent ?? 0;
                  const opens = c.opens ?? 0;
                  const rate = sent > 0 ? (opens / sent) * 100 : null;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-4 py-3 text-text">{c.name}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {c.sentAt
                          ? format(new Date(c.sentAt), "d MMM yyyy", {
                              locale: nl,
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatNumber(sent)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatNumber(opens)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatNumber(c.clicks ?? 0)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {rate != null ? formatPercent(rate) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
