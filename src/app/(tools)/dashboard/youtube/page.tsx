import Link from "next/link";
import { ChannelAutoSync } from "@/components/dashboard/channel-auto-sync";
import { ChannelPerformanceCharts } from "@/components/dashboard/channel-performance-charts";
import { SocialPostsView } from "@/components/dashboard/social-posts-view";
import { SectionHeader } from "@/components/ui/section-header";
import { getChannelStats } from "@/lib/integrations/youtube/client";
import { needsSocialHistoryBackfill } from "@/lib/integrations/social/history-coverage";
import { loadMarketingPostsBundle } from "@/lib/cache/dashboard";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "YouTube" };
export const dynamic = "force-dynamic";

const emptyBundle = {
  posts: [],
  aggregates: [],
  analyzedCount: 0,
  lastSyncedAt: null as string | null,
  hasMore: false,
  nextCursor: null as string | null,
};

export default async function YouTubePage() {
  const hasKey = Boolean(process.env.YOUTUBE_API_KEY?.trim());
  const [channelResult, bundle, chartBundle, backfillHistory] =
    await Promise.all([
      getChannelStats().catch(
        (): { ok: false; error: string } => ({
          ok: false,
          error: "YouTube kanaal laden mislukt",
        }),
      ),
      loadMarketingPostsBundle({
        limit: 24,
        channel: "youtube",
        withLift: true,
      }).catch(() => emptyBundle),
      loadMarketingPostsBundle({
        limit: 50,
        channel: "youtube",
        range: "1y",
        withLift: false,
      }).catch(() => emptyBundle),
      needsSocialHistoryBackfill("youtube").catch(() => true),
    ]);

  const channel = channelResult.ok ? channelResult.channel : null;
  const posts = bundle.posts;
  const totalEngagement = posts.reduce((s, p) => s + p.engagement, 0);
  const totalViews = posts.reduce((s, p) => s + p.impressions, 0);
  const totalLikes = posts.reduce((s, p) => s + p.likeCount, 0);
  const totalComments = posts.reduce((s, p) => s + p.commentCount, 0);
  const avgEngRate =
    totalViews > 0 ? (totalEngagement / totalViews) * 100 : null;

  return (
    <div className="animate-fade-up">
      <SectionHeader
        eyebrow="YouTube"
        title={channel?.title ?? "Kanaalmetrics"}
        description={
          channel
            ? "Views, likes en comments · posts verversen automatisch bij openen."
            : channelResult.ok === false
              ? channelResult.error
              : "Koppel YOUTUBE_API_KEY via Bronnen."
        }
      />

      <ChannelAutoSync
        channel="youtube"
        lastSyncedAt={bundle.lastSyncedAt}
        backfillHistory={backfillHistory}
        enabled={hasKey}
      />

      {!channel ? (
        <p className="border border-border px-4 py-3 text-sm text-text-muted">
          YouTube is nog niet bereikbaar. Check{" "}
          <Link href="/koppelingen" className="underline">
            Bronnen
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="mb-10 flex flex-wrap gap-8">
            <Stat
              value={formatNumber(channel.subscriberCount)}
              label="subscribers"
            />
            <Stat value={formatNumber(totalViews)} label="views" />
            <Stat value={formatNumber(totalLikes)} label="likes" />
            <Stat value={formatNumber(totalComments)} label="comments" />
            <Stat
              value={avgEngRate != null ? formatPercent(avgEngRate, 1) : "—"}
              label="eng. rate"
            />
            <Stat value={formatNumber(posts.length)} label="posts" />
          </section>

          <ChannelPerformanceCharts
            channel="youtube"
            initialPosts={chartBundle.posts}
            impressionsLabel="views"
          />

          <hr className="my-8 border-border" />

          <SocialPostsView
            posts={posts}
            channel="youtube"
            initialCursor={bundle.nextCursor}
            initialHasMore={bundle.hasMore}
            gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            aspectClass="aspect-video"
            emptyMessage="Nog geen YouTube-video's — sync loopt bij openen van deze pagina."
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
