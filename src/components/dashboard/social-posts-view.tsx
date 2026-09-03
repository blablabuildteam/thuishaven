"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Heart,
  LayoutGrid,
  LayoutList,
  LoaderCircle,
  MessageCircle,
  Share2,
} from "lucide-react";
import { SocialPostCard } from "@/components/dashboard/social-post-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  MarketingPostRow,
  MarketingPostsPage,
  SocialFeedChannel,
} from "@/lib/marketing/post-types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type ViewMode = "grid" | "list";

type Props = {
  posts: MarketingPostRow[];
  channel: SocialFeedChannel;
  initialCursor: string | null;
  initialHasMore: boolean;
  /** Tailwind grid cols for card view. */
  gridClassName?: string;
  aspectClass?: string;
  emptyMessage: string;
};

function viewsLabel(post: MarketingPostRow): string | null {
  if (post.channel === "instagram") {
    if (post.impressions > 0) return `${formatNumber(post.impressions)} views`;
    if (post.reach > 0) return `${formatNumber(post.reach)} reach`;
    return null;
  }
  if (post.impressions > 0) return `${formatNumber(post.impressions)} views`;
  return null;
}

function SocialPostRow({ post }: { post: MarketingPostRow }) {
  const img = post.storedMediaUrl || post.thumbnailUrl || post.mediaUrl;
  const format = post.visualFeatures?.format;
  const label = viewsLabel(post);

  return (
    <li className="border border-border bg-surface">
      <div className="flex gap-3 p-3 sm:items-center">
        <div
          className="size-14 shrink-0 bg-bg-elevated bg-cover bg-center sm:size-16"
          style={img ? { backgroundImage: `url(${img})` } : undefined}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone="neutral">{format ?? post.channel}</StatusBadge>
            {post.visualFeatures?.offer && (
              <StatusBadge tone="accent">{post.visualFeatures.offer}</StatusBadge>
            )}
            <time
              dateTime={post.publishedAt ?? undefined}
              className="text-[11px] text-text-dim sm:ml-auto"
            >
              {formatDate(post.publishedAt)}
            </time>
          </div>

          <p className="mt-1 truncate text-sm font-medium">
            {post.title || "Zonder titel"}
          </p>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
            {label && <span>{label}</span>}
            {post.likeCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3" aria-hidden />
                {formatNumber(post.likeCount)}
              </span>
            )}
            {post.commentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="size-3" aria-hidden />
                {formatNumber(post.commentCount)}
              </span>
            )}
            {post.shareCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Share2 className="size-3" aria-hidden />
                {formatNumber(post.shareCount)}
              </span>
            )}
            {post.ticketLift?.signal === "measured" && (
              <span className="text-text-dim">
                +{formatNumber(post.ticketLift.sold ?? 0)} tickets ±48u
              </span>
            )}
          </div>
        </div>

        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="hidden shrink-0 self-center text-xs underline underline-offset-2 sm:inline"
          >
            Open
          </a>
        )}
      </div>
    </li>
  );
}

export function SocialPostsView({
  posts: initialPosts,
  channel,
  initialCursor,
  initialHasMore,
  gridClassName = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
  aspectClass,
  emptyMessage,
}: Props) {
  const [view, setView] = useState<ViewMode>("list");
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const channelRef = useRef(channel);
  const headIdRef = useRef(initialPosts[0]?.id ?? null);

  // Reset only on channel change or a truly new first page (new head post).
  // Ignore soft router.refresh() that would wipe scrolled pages.
  useEffect(() => {
    const nextHead = initialPosts[0]?.id ?? null;
    const channelChanged = channelRef.current !== channel;
    const headChanged = nextHead !== headIdRef.current;

    if (!channelChanged && !headChanged) return;

    channelRef.current = channel;
    headIdRef.current = nextHead;

    if (channelChanged) {
      setPosts(initialPosts);
      setCursor(initialCursor);
      setHasMore(initialHasMore);
      setError(null);
      return;
    }

    // New head after sync: refresh the first page, keep any scrolled tail.
    setPosts((prev) => {
      if (prev.length <= initialPosts.length) return initialPosts;
      const headIds = new Set(initialPosts.map((p) => p.id));
      const tail = prev
        .slice(initialPosts.length)
        .filter((p) => !headIds.has(p.id));
      return [...initialPosts, ...tail];
    });
    setError(null);
  }, [channel, initialPosts, initialCursor, initialHasMore]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        channel,
        cursor,
        limit: "24",
      });
      const res = await fetch(`/api/dashboard/marketing-posts?${params}`);
      const data = (await res.json().catch(() => ({}))) as MarketingPostsPage & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Meer posts laden mislukt");
      }

      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = data.posts.filter((p) => !seen.has(p.id));
        return next.length ? [...prev, ...next] : prev;
      });
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Meer posts laden mislukt");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [channel, cursor, hasMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  if (posts.length === 0) {
    return (
      <p className="border border-border px-4 py-3 text-sm text-text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium tracking-[0.12em] text-text-dim uppercase">
          Posts · {posts.length}
          {hasMore ? "+" : ""}
        </h2>
        <div
          className="flex border border-border"
          role="group"
          aria-label="Weergave"
        >
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition",
              view === "list"
                ? "bg-text text-bg"
                : "text-text-muted hover:text-text",
            )}
            aria-pressed={view === "list"}
          >
            <LayoutList className="size-3.5" aria-hidden />
            Lijst
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            className={cn(
              "inline-flex items-center gap-1.5 border-l border-border px-2.5 py-1.5 text-xs transition",
              view === "grid"
                ? "bg-text text-bg"
                : "text-text-muted hover:text-text",
            )}
            aria-pressed={view === "grid"}
          >
            <LayoutGrid className="size-3.5" aria-hidden />
            Grid
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <ul className={gridClassName}>
          {posts.map((post) => (
            <SocialPostCard
              key={post.id}
              post={post}
              aspectClass={aspectClass}
            />
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <SocialPostRow key={post.id} post={post} />
          ))}
        </ul>
      )}

      <div
        ref={sentinelRef}
        className="mt-4 flex min-h-10 flex-col items-center justify-center gap-2"
      >
        {loading && (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-text-muted"
          >
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Meer posts laden…
          </p>
        )}
        {error && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="text-xs text-danger underline underline-offset-2"
          >
            {error} · Opnieuw
          </button>
        )}
        {!hasMore && !loading && (
          <p className="text-[11px] tracking-[0.08em] text-text-dim uppercase">
            Einde van de sync
          </p>
        )}
      </div>
    </div>
  );
}
