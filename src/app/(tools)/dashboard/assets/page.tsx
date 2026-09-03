import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadMarketingPostsBundle } from "@/lib/cache/dashboard";
import { marketingPosts as mockPosts } from "@/lib/mock/dashboard";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Creatives" };
export const dynamic = "force-dynamic";

const OFFER_LABEL: Record<string, string> = {
  lineup: "Line-up",
  early_bird: "Early bird",
  sold_out: "Sold out",
  aftermovie: "Aftermovie",
  recap: "Recap",
  door: "Door / last call",
  other: "Overig",
};

export default async function AssetsPage() {
  const bundle = await loadMarketingPostsBundle({
    limit: 24,
    withLift: true,
  }).catch(() => ({
    posts: [],
    aggregates: [],
    analyzedCount: 0,
    lastSyncedAt: null as string | null,
    hasMore: false,
    nextCursor: null as string | null,
  }));
  const usingLive = bundle.posts.length > 0;

  return (
    <div>
      <SectionHeader
        eyebrow="Visual recognition"
        title="Welke creatives verkopen"
        description={
          usingLive
            ? `${bundle.analyzedCount}/${bundle.posts.length} posts geanalyseerd · tickets ±48u rond publicatie (Weeztix-dagcurve).`
            : "Nog geen gesyncte posts — mock preview. Sync Instagram via Bronnen, daarna Analyseer."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/inzichten"
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

      {usingLive && bundle.aggregates.length > 0 && (
        <section className="mb-8">
          <p className="mb-3 text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
            Wat scoort naast ticketlift
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bundle.aggregates.slice(0, 6).map((a) => (
              <li
                key={a.key}
                className="border border-border bg-surface px-4 py-3"
              >
                <p className="text-sm font-medium">{a.label}</p>
                <p className="mt-1 font-display text-2xl tracking-[0.02em]">
                  ~{formatNumber(Math.round(a.avgLift))}
                </p>
                <p className="mt-0.5 text-xs text-text-dim">
                  gem. tickets ±48u · n={a.measured}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {usingLive
          ? bundle.posts.map((post) => {
              const img =
                post.storedMediaUrl || post.thumbnailUrl || post.mediaUrl;
              const vf = post.visualFeatures;
              const colors =
                vf?.dominantColors?.length
                  ? vf.dominantColors
                  : vf?.palette ?? [];
              return (
                <article
                  key={post.id}
                  className="overflow-hidden border border-border bg-surface"
                >
                  <div
                    className="relative flex h-40 items-end bg-bg-elevated bg-cover bg-center p-4"
                    style={img ? { backgroundImage: `url(${img})` } : undefined}
                  >
                    {colors.length > 0 && (
                      <div className="flex gap-1.5">
                        {colors.slice(0, 4).map((c) => (
                          <span
                            key={c}
                            className="size-5 border border-white/30"
                            style={{ background: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] tracking-wider text-text-dim uppercase">
                      {post.channel}
                      {vf?.format ? ` · ${vf.format}` : ""}
                      {vf?.offer
                        ? ` · ${OFFER_LABEL[vf.offer] ?? vf.offer}`
                        : ""}
                    </p>
                    <h3 className="mt-1 text-sm font-medium text-text">
                      {post.title || "Zonder caption"}
                    </h3>
                    {vf?.artists && vf.artists.length > 0 && (
                      <p className="mt-1 text-xs text-text-muted">
                        {vf.artists.slice(0, 4).join(" · ")}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {post.analyzedAt ? (
                        <StatusBadge tone="success">Geanalyseerd</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Nog geen vision</StatusBadge>
                      )}
                      {vf?.hasTextOverlay != null && (
                        <StatusBadge tone="accent">
                          {vf.hasTextOverlay ? "Tekst-overlay" : "Geen overlay"}
                        </StatusBadge>
                      )}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="text-text-dim">Tickets ±48u</dt>
                        <dd className="mt-0.5 font-mono text-accent">
                          {post.ticketLift?.signal === "measured"
                            ? `+${formatNumber(post.ticketLift.sold ?? 0)}`
                            : "geen curve"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-dim">Engagement</dt>
                        <dd className="mt-0.5 font-mono text-text">
                          {formatNumber(post.engagement)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-dim">Reach</dt>
                        <dd className="mt-0.5 font-mono text-text">
                          {formatNumber(post.reach)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-dim">Sfeer</dt>
                        <dd className="mt-0.5 text-text">
                          {vf?.mood || "—"}
                        </dd>
                      </div>
                    </dl>
                    {vf?.textInImage && (
                      <p className="mt-3 text-xs text-text-muted">
                        Op beeld: “{vf.textInImage}”
                      </p>
                    )}
                    {post.permalink && (
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-xs underline underline-offset-2"
                      >
                        Open op Instagram
                      </a>
                    )}
                  </div>
                </article>
              );
            })
          : mockPosts.map((post) => (
              <article
                key={post.id}
                className="overflow-hidden border border-border bg-surface"
              >
                <div
                  className="flex h-36 items-end p-4"
                  style={{
                    background: `linear-gradient(135deg, ${post.visualFeatures.dominantColors[0]}55, ${post.visualFeatures.dominantColors[1] ?? "#000000"} 70%)`,
                  }}
                >
                  <div className="flex gap-1.5">
                    {post.visualFeatures.dominantColors.map((c) => (
                      <span
                        key={c}
                        className="size-5 border border-white/20"
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[10px] tracking-wider text-text-dim uppercase">
                    {post.channel} · {post.visualFeatures.format} · mock
                  </p>
                  <h3 className="mt-1 text-sm font-medium text-text">
                    {post.title}
                  </h3>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-text-dim">Tickets ±48u</dt>
                      <dd className="mt-0.5 font-mono text-accent">
                        +{post.ticketsAroundPublish}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-dim">Engagement</dt>
                      <dd className="mt-0.5 font-mono text-text">
                        {post.engagement.toLocaleString("nl-NL")}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
      </div>
    </div>
  );
}
