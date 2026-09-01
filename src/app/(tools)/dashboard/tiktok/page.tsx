import Link from "next/link";
import { ChannelAutoSync } from "@/components/dashboard/channel-auto-sync";
import { SocialPostCard } from "@/components/dashboard/social-post-card";
import { SectionHeader } from "@/components/ui/section-header";
import { getUserInfo } from "@/lib/integrations/tiktok/client";
import { loadMarketingPostsBundle } from "@/lib/cache/dashboard";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "TikTok" };
export const dynamic = "force-dynamic";

export default async function TikTokPage() {
  const hasToken = Boolean(process.env.TIKTOK_ACCESS_TOKEN?.trim());
  const [userResult, bundle] = await Promise.all([
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
    }).catch(() => ({
      posts: [],
      aggregates: [],
      analyzedCount: 0,
      lastSyncedAt: null as string | null,
    })),
  ]);

  const user = userResult.ok ? userResult.user : null;
  const posts = bundle.posts;
  const totalEngagement = posts.reduce((s, p) => s + p.engagement, 0);
  const totalViews = posts.reduce((s, p) => s + p.impressions, 0);
  const totalLikes = posts.reduce((s, p) => s + p.likeCount, 0);
  const totalComments = posts.reduce((s, p) => s + p.commentCount, 0);
  const avgEngRate =
    totalViews > 0 ? (totalEngagement / totalViews) * 100 : null;
  const top = [...posts].sort((a, b) => b.impressions - a.impressions)[0];

  return (
    <div>
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
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/dashboards"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Dashboards
            </Link>
            <Link
              href="/koppelingen"
              className="bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              Bronnen
            </Link>
          </div>
        }
      />

      <ChannelAutoSync
        channel="tiktok"
        lastSyncedAt={bundle.lastSyncedAt}
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
          <section className="mb-10 flex flex-wrap gap-8">
            <Stat
              value={formatNumber(user.followerCount)}
              label="volgers"
            />
            <Stat value={formatNumber(totalViews)} label="views (sync)" />
            <Stat value={formatNumber(totalLikes)} label="likes (sync)" />
            <Stat value={formatNumber(totalComments)} label="comments" />
            <Stat
              value={avgEngRate != null ? formatPercent(avgEngRate, 1) : "—"}
              label="eng. rate"
            />
            <Stat
              value={formatNumber(posts.length)}
              label="in database"
            />
          </section>

          {top && (
            <p className="mb-6 text-sm text-text-muted">
              Top video in sync:{" "}
              <span className="font-medium text-text">
                {top.title || "Zonder titel"}
              </span>{" "}
              · {formatNumber(top.impressions)} views
            </p>
          )}

          {posts.length === 0 ? (
            <p className="border border-border px-4 py-3 text-sm text-text-muted">
              Nog geen TikTok-video&apos;s — sync loopt bij openen van deze
              pagina.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {posts.map((post) => (
                <SocialPostCard
                  key={post.id}
                  post={post}
                  aspectClass="aspect-[9/16] max-h-72"
                />
              ))}
            </ul>
          )}
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
