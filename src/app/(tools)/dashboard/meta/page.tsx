import Link from "next/link";
import { ChannelAutoSync } from "@/components/dashboard/channel-auto-sync";
import { ChannelPerformanceCharts } from "@/components/dashboard/channel-performance-charts";
import { SocialPostsView } from "@/components/dashboard/social-posts-view";
import { SectionHeader } from "@/components/ui/section-header";
import { loadMarketingPostsBundle } from "@/lib/cache/dashboard";
import { needsSocialHistoryBackfill } from "@/lib/integrations/social/history-coverage";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Meta" };
export const dynamic = "force-dynamic";

const emptyBundle = {
  posts: [],
  aggregates: [],
  analyzedCount: 0,
  lastSyncedAt: null as string | null,
  hasMore: false,
  nextCursor: null as string | null,
};

export default async function MetaPage() {
  const hasToken = Boolean(process.env.META_ACCESS_TOKEN?.trim());
  const [bundle, chartBundle, backfillHistory] = await Promise.all([
    loadMarketingPostsBundle({
      limit: 24,
      channel: "instagram",
      withLift: true,
    }).catch(() => emptyBundle),
    loadMarketingPostsBundle({
      limit: 50,
      channel: "instagram",
      range: "1y",
      withLift: false,
    }).catch(() => emptyBundle),
    needsSocialHistoryBackfill("instagram").catch(() => true),
  ]);

  const posts = bundle.posts;
  const totalReach = posts.reduce((s, p) => s + p.reach, 0);
  const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0);
  const totalLikes = posts.reduce((s, p) => s + p.likeCount, 0);
  const totalComments = posts.reduce((s, p) => s + p.commentCount, 0);
  const totalEngagement = posts.reduce((s, p) => s + p.engagement, 0);
  const avgEngRate =
    totalImpressions > 0
      ? (totalEngagement / totalImpressions) * 100
      : totalReach > 0
        ? (totalEngagement / totalReach) * 100
        : null;
  const impressionsLabel = totalImpressions > 0 ? "views" : "reach";

  return (
    <div className="animate-fade-up">
      <SectionHeader
        eyebrow="Meta · Instagram"
        title="Instagram metrics"
        description={
          hasToken
            ? "Views, likes en comments · posts verversen automatisch bij openen."
            : "Wacht op META_ACCESS_TOKEN. Pagina licht op zodra de token live is."
        }
      />

      <ChannelAutoSync
        channel="instagram"
        lastSyncedAt={bundle.lastSyncedAt}
        backfillHistory={backfillHistory}
        enabled={hasToken}
      />

      {!hasToken && posts.length === 0 ? (
        <div className="border border-border bg-surface p-5">
          <p className="text-sm font-medium">Meta nog niet gekoppeld</p>
          <p className="mt-2 max-w-xl text-sm text-text-muted">
            Zodra de Meta access token beschikbaar is, synct Instagram posts
            automatisch naar deze view. Tot die tijd blijven Mailings, Tickets
            en YouTube/TikTok beschikbaar.
          </p>
        </div>
      ) : (
        <>
          {!hasToken && (
            <p className="mb-6 border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
              Token ontbreekt — toon cached posts uit eerdere syncs. Check{" "}
              <Link href="/koppelingen" className="underline">
                Bronnen
              </Link>
              .
            </p>
          )}

          <section className="mb-10 flex flex-wrap gap-8">
            <Stat value={formatNumber(posts.length)} label="posts" />
            <Stat
              value={formatNumber(totalImpressions || totalReach)}
              label={impressionsLabel}
            />
            <Stat value={formatNumber(totalLikes)} label="likes" />
            <Stat value={formatNumber(totalComments)} label="comments" />
            <Stat
              value={avgEngRate != null ? formatPercent(avgEngRate, 1) : "—"}
              label="eng. rate"
            />
            <Stat
              value={`${bundle.analyzedCount}/${posts.length}`}
              label="geanalyseerd"
            />
          </section>

          <ChannelPerformanceCharts
            channel="instagram"
            initialPosts={chartBundle.posts}
            impressionsLabel={impressionsLabel}
          />

          <hr className="my-8 border-border" />

          <SocialPostsView
            posts={posts}
            channel="instagram"
            initialCursor={bundle.nextCursor}
            initialHasMore={bundle.hasMore}
            gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            emptyMessage={
              hasToken
                ? "Nog geen Instagram-posts — sync loopt bij openen van deze pagina."
                : "Nog geen Instagram-posts. Koppel Meta via Bronnen."
            }
          />
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <p>
      <span className="font-display text-3xl">{value}</span>
      <span className="mt-1 block text-[11px] tracking-[0.12em] text-text-dim uppercase">
        {label}
      </span>
    </p>
  );
}
