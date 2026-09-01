import Link from "next/link";
import { ChannelAutoSync } from "@/components/dashboard/channel-auto-sync";
import { SocialPostCard } from "@/components/dashboard/social-post-card";
import { SectionHeader } from "@/components/ui/section-header";
import { loadMarketingPostsBundle } from "@/lib/cache/dashboard";
import { formatNumber, formatPercent } from "@/lib/utils";

export const metadata = { title: "Meta" };
export const dynamic = "force-dynamic";

export default async function MetaPage() {
  const hasToken = Boolean(process.env.META_ACCESS_TOKEN?.trim());
  const bundle = await loadMarketingPostsBundle({
    limit: 24,
    channel: "instagram",
    withLift: true,
  }).catch(() => ({
    posts: [],
    aggregates: [],
    analyzedCount: 0,
    lastSyncedAt: null as string | null,
  }));

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

  return (
    <div>
      <SectionHeader
        eyebrow="Meta · Instagram"
        title="Instagram metrics"
        description={
          hasToken
            ? "Views, likes en comments · posts verversen automatisch bij openen."
            : "Wacht op META_ACCESS_TOKEN. Pagina licht op zodra de token live is."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/assets"
              className="border border-border px-3 py-2 text-sm hover:border-text"
            >
              Creatives
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
        channel="instagram"
        lastSyncedAt={bundle.lastSyncedAt}
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
              label={totalImpressions > 0 ? "views" : "reach"}
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

          {posts.length === 0 ? (
            <p className="border border-border px-4 py-3 text-sm text-text-muted">
              {hasToken
                ? "Nog geen Instagram-posts — sync loopt bij openen van deze pagina."
                : "Nog geen Instagram-posts. Koppel Meta via Bronnen."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {posts.map((post) => (
                <SocialPostCard key={post.id} post={post} />
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
