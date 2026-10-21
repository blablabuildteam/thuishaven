import Link from "next/link";
import { ChannelAutoSync } from "@/components/dashboard/channel-auto-sync";
import { ChannelPerformanceCharts } from "@/components/dashboard/channel-performance-charts";
import { SocialPostsView } from "@/components/dashboard/social-posts-view";
import { SectionHeader } from "@/components/ui/section-header";
import { getUserInfo } from "@/lib/integrations/tiktok/client";
import { needsSocialHistoryBackfill } from "@/lib/integrations/social/history-coverage";
import { loadMarketingPostsBundle } from "@/lib/cache/dashboard";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "TikTok" };
export const dynamic = "force-dynamic";

const emptyBundle = {
  posts: [],
  aggregates: [],
  analyzedCount: 0,
  lastSyncedAt: null as string | null,
  hasMore: false,
  nextCursor: null as string | null,
};

export default async function TikTokPage() {
  const hasToken = Boolean(process.env.TIKTOK_ACCESS_TOKEN?.trim());
  const [userResult, bundle, chartBundle, backfillHistory] = await Promise.all([
    getUserInfo().catch(
      (): { ok: false; error: string } => ({
        ok: false,
        error: "TikTok account laden mislukt",
      }),
    ),
    loadMarketingPostsBundle({
      limit: 24,
      channel: "tiktok",
      withLift: true,
    }).catch(() => emptyBundle),
    loadMarketingPostsBundle({
      limit: 50,
      channel: "tiktok",
      range: "1y",
      withLift: false,
    }).catch(() => emptyBundle),
    needsSocialHistoryBackfill("tiktok").catch(() => true),
  ]);

  const user = userResult.ok ? userResult.user : null;
  const posts = bundle.posts;
  const top = [...posts].sort((a, b) => b.impressions - a.impressions)[0];

  return (
    <div className="animate-fade-up">
      <SectionHeader
        eyebrow="TikTok"
        title={
          user?.username
            ? `@${user.username}`
            : user?.displayName ?? "Accountmetrics"
        }
        description={
          user
            ? "Views, likes en comments · posts verversen automatisch bij openen."
            : userResult.ok === false
              ? userResult.error
              : "Koppel TikTok via Bronnen."
        }
      />

      <ChannelAutoSync
        channel="tiktok"
        lastSyncedAt={bundle.lastSyncedAt}
        backfillHistory={backfillHistory}
        enabled={hasToken}
      />

      {!user ? (
        <p className="border border-border px-4 py-3 text-sm text-text-muted">
          TikTok is nog niet bereikbaar. Check{" "}
          <Link href="/koppelingen" className="underline">
            Bronnen
          </Link>
          .
        </p>
      ) : (
        <>
          {top && (
            <p className="mb-6 text-sm text-text-muted">
              Top video in sync:{" "}
              <span className="font-medium text-text">
                {top.title || "Zonder titel"}
              </span>{" "}
              · {formatNumber(top.impressions)} views
            </p>
          )}

          <ChannelPerformanceCharts
            channel="tiktok"
            initialPosts={chartBundle.posts}
            impressionsLabel="views"
          />

          <hr className="my-8 border-border" />

          <SocialPostsView
            posts={posts}
            channel="tiktok"
            initialCursor={bundle.nextCursor}
            initialHasMore={bundle.hasMore}
            gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            aspectClass="aspect-[9/16] max-h-72"
            emptyMessage="Nog geen TikTok-video's — sync loopt bij openen van deze pagina."
          />
        </>
      )}
    </div>
  );
}
