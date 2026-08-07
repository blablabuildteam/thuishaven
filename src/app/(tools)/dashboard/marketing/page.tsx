import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import {
  emailCampaigns,
  marketingPosts,
} from "@/lib/mock/dashboard";
import { formatNumber, formatPercent } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Marketing" };

export default function MarketingPage() {
  const totalReach = marketingPosts.reduce((s, p) => s + p.reach, 0);
  const totalEngagement = marketingPosts.reduce((s, p) => s + p.engagement, 0);

  return (
    <div>
      <SectionHeader
        eyebrow="Marketing"
        title="Kanalen & campagnes"
        description="Instagram, TikTok, YouTube en Brevo — gesynchroniseerd per editie. Data vanaf go-live, geen historische backfill in v1."
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Totale reach" value={formatNumber(totalReach)} />
        <MetricCard
          label="Engagement"
          value={formatNumber(totalEngagement)}
          accent
        />
        <MetricCard
          label="Posts / mails"
          value={String(marketingPosts.length + emailCampaigns.length)}
        />
      </div>

      <section className="mb-6 border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">Social posts</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="pb-3 font-medium">Kanaal</th>
                <th className="pb-3 font-medium">Titel</th>
                <th className="pb-3 font-medium">Gepubliceerd</th>
                <th className="pb-3 font-medium">Reach</th>
                <th className="pb-3 font-medium">Engagement</th>
                <th className="pb-3 font-medium">Tickets ±48u</th>
              </tr>
            </thead>
            <tbody>
              {marketingPosts
                .filter((p) => p.channel !== "brevo")
                .map((post) => (
                  <tr
                    key={post.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 capitalize text-text-muted">
                      {post.channel}
                    </td>
                    <td className="py-3 text-text">{post.title}</td>
                    <td className="py-3 text-text-muted">
                      {format(new Date(post.publishedAt), "d MMM", {
                        locale: nl,
                      })}
                    </td>
                    <td className="py-3 font-mono">
                      {formatNumber(post.reach)}
                    </td>
                    <td className="py-3 font-mono">
                      {formatNumber(post.engagement)}
                    </td>
                    <td className="py-3 font-mono text-accent">
                      +{post.ticketsAroundPublish}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Brevo e-mailcampagnes
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {emailCampaigns.map((c) => (
            <div
              key={c.id}
              className="border border-border bg-bg p-4"
            >
              <p className="text-sm text-text">{c.name}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="font-mono text-lg">{formatNumber(c.sent)}</p>
                  <p className="text-[10px] uppercase text-text-dim">sent</p>
                </div>
                <div>
                  <p className="font-mono text-lg text-accent">
                    {formatPercent((c.opens / c.sent) * 100)}
                  </p>
                  <p className="text-[10px] uppercase text-text-dim">open</p>
                </div>
                <div>
                  <p className="font-mono text-lg">
                    {formatPercent((c.clicks / c.sent) * 100)}
                  </p>
                  <p className="text-[10px] uppercase text-text-dim">click</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
