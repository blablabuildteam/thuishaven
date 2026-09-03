import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, marketingPosts } from "@/lib/db/schema";
import {
  aggregateLiftByFeature,
  ticketLiftByPostIds,
  type CreativeLiftAggregate,
  type TicketLift,
} from "@/lib/marketing/ticket-lift";
import {
  isSocialRange,
  socialRangeSince,
  type SocialRange,
} from "@/lib/marketing/social-range";
import type {
  MarketingPostRow,
  MarketingPostsPage,
  SocialFeedChannel,
} from "@/lib/marketing/post-types";

export type { SocialRange } from "@/lib/marketing/social-range";
export {
  DEFAULT_SOCIAL_RANGE,
  SOCIAL_RANGE_LABEL,
  SOCIAL_RANGES,
  isSocialRange,
  socialRangeSince,
} from "@/lib/marketing/social-range";

export type {
  MarketingPostRow,
  MarketingPostsPage,
  SocialFeedChannel,
} from "@/lib/marketing/post-types";

export type MarketingPostsBundle = {
  posts: MarketingPostRow[];
  aggregates: CreativeLiftAggregate[];
  analyzedCount: number;
  /** Newest syncedAt among returned posts — for view auto-refresh. */
  lastSyncedAt: string | null;
  /** True when more posts exist beyond this page. */
  hasMore: boolean;
  /** Cursor for infinite scroll (null when hasMore is false). */
  nextCursor: string | null;
};

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;

type DbMarketingPost = typeof marketingPosts.$inferSelect;

function encodeCursor(publishedAt: string | null, id: string): string {
  return Buffer.from(
    JSON.stringify({ publishedAt, id }),
    "utf8",
  ).toString("base64url");
}

export function decodeMarketingPostsCursor(
  raw: string | null | undefined,
): { publishedAt: string | null; id: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as { publishedAt?: unknown; id?: unknown };
    if (typeof parsed.id !== "string" || !parsed.id) return null;
    const publishedAt =
      parsed.publishedAt == null
        ? null
        : typeof parsed.publishedAt === "string"
          ? parsed.publishedAt
          : null;
    return { publishedAt, id: parsed.id };
  } catch {
    return null;
  }
}

async function attachLiftAndMap(
  rows: DbMarketingPost[],
  withLift: boolean,
): Promise<MarketingPostRow[]> {
  const db = getDb();
  const editionIds = [
    ...new Set(
      rows.map((r) => r.editionId).filter((id): id is string => id != null),
    ),
  ];
  const editionStarts = new Map<string, Date>();
  if (withLift && editionIds.length > 0) {
    const eds = await db
      .select({ id: editions.id, startsAt: editions.startsAt })
      .from(editions)
      .where(inArray(editions.id, editionIds));
    for (const e of eds) editionStarts.set(e.id, e.startsAt);
  }

  const lifts = withLift
    ? await ticketLiftByPostIds(
        rows.map((r) => ({
          id: r.id,
          publishedAt: r.publishedAt?.toISOString() ?? null,
          editionId: r.editionId,
          eventStartsAt: r.editionId
            ? (editionStarts.get(r.editionId) ?? null)
            : null,
          offer: r.visualFeatures?.offer,
          text: [r.title, r.caption].filter(Boolean).join(" "),
        })),
      )
    : new Map<string, TicketLift>();

  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    editionId: r.editionId,
    externalId: r.externalId,
    title: r.title,
    caption: r.caption,
    permalink: r.permalink,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    reach: r.reach ?? 0,
    impressions: r.impressions ?? 0,
    engagement: r.engagement ?? 0,
    likeCount: r.likeCount ?? 0,
    commentCount: r.commentCount ?? 0,
    shareCount: r.shareCount ?? 0,
    mediaUrl: r.mediaUrl,
    thumbnailUrl: r.thumbnailUrl,
    storedMediaUrl: r.storedMediaUrl,
    videoUrl: r.videoUrl ?? null,
    visualFeatures: r.visualFeatures ?? null,
    analyzedAt: r.analyzedAt?.toISOString() ?? null,
    syncedAt: r.syncedAt?.toISOString() ?? null,
    ticketLift: lifts.get(r.id) ?? null,
  }));
}

export const loadRecentMarketingPosts = cache(
  async (options?: {
    limit?: number;
    channel?: SocialFeedChannel;
    withLift?: boolean;
    range?: SocialRange;
    since?: Date | string | null;
  }): Promise<MarketingPostRow[]> => {
    const bundle = await loadMarketingPostsBundle(options);
    return bundle.posts;
  },
);

export const loadMarketingPostsBundle = cache(
  async (options?: {
    limit?: number;
    channel?: SocialFeedChannel;
    withLift?: boolean;
    range?: SocialRange;
    since?: Date | string | null;
  }): Promise<MarketingPostsBundle> => {
    const page = await loadMarketingPostsPage({
      limit: options?.limit,
      channel: options?.channel,
      withLift: options?.withLift,
      range: options?.range,
      since: options?.since,
    });

    const aggregates = aggregateLiftByFeature(
      page.posts
        .filter(
          (p) =>
            p.ticketLift?.signal !== "excluded" &&
            p.ticketLift?.role !== "after",
        )
        .map((p) => ({
          offer: p.visualFeatures?.offer ?? null,
          format: p.visualFeatures?.format ?? null,
          hasTextOverlay: p.visualFeatures?.hasTextOverlay ?? null,
          lift: p.ticketLift?.sold ?? null,
        })),
    );

    let lastSyncedAt: string | null = null;
    for (const p of page.posts) {
      if (!p.syncedAt) continue;
      if (!lastSyncedAt || p.syncedAt > lastSyncedAt) lastSyncedAt = p.syncedAt;
    }

    return {
      posts: page.posts,
      aggregates,
      analyzedCount: page.posts.filter((p) => p.analyzedAt).length,
      lastSyncedAt,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  },
);

function resolveSince(options?: {
  range?: SocialRange;
  since?: Date | string | null;
}): Date | null {
  if (options?.since != null) {
    const d =
      options.since instanceof Date ? options.since : new Date(options.since);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (options?.range && isSocialRange(options.range)) {
    return socialRangeSince(options.range);
  }
  return null;
}

/** Cursor-paginated feed for channel views (infinite scroll). */
export async function loadMarketingPostsPage(options?: {
  limit?: number;
  channel?: SocialFeedChannel;
  cursor?: string | null;
  withLift?: boolean;
  range?: SocialRange;
  since?: Date | string | null;
}): Promise<MarketingPostsPage> {
  if (!hasDatabase()) {
    return { posts: [], hasMore: false, nextCursor: null };
  }

  const db = getDb();
  const limit = Math.min(
    Math.max(options?.limit ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const withLift = options?.withLift !== false;
  const cursor = decodeMarketingPostsCursor(options?.cursor);
  const since = resolveSince(options);

  const conditions = [];
  if (options?.channel) {
    conditions.push(eq(marketingPosts.channel, options.channel));
  }
  if (since) {
    conditions.push(gte(marketingPosts.publishedAt, since));
  }
  if (cursor) {
    // (published_at, id) < cursor — null publishedAt sorts last in DESC
    if (cursor.publishedAt) {
      const cursorDate = new Date(cursor.publishedAt);
      conditions.push(
        or(
          lt(marketingPosts.publishedAt, cursorDate),
          and(
            eq(marketingPosts.publishedAt, cursorDate),
            lt(marketingPosts.id, cursor.id),
          ),
          sql`${marketingPosts.publishedAt} is null`,
        )!,
      );
    } else {
      conditions.push(
        and(
          sql`${marketingPosts.publishedAt} is null`,
          lt(marketingPosts.id, cursor.id),
        )!,
      );
    }
  }

  const where = conditions.length === 0 ? undefined : and(...conditions);

  const rows = where
    ? await db
        .select()
        .from(marketingPosts)
        .where(where)
        .orderBy(desc(marketingPosts.publishedAt), desc(marketingPosts.id))
        .limit(limit + 1)
    : await db
        .select()
        .from(marketingPosts)
        .orderBy(desc(marketingPosts.publishedAt), desc(marketingPosts.id))
        .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const posts = await attachLiftAndMap(pageRows, withLift);
  const last = posts[posts.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.publishedAt, last.id) : null;

  return { posts, hasMore, nextCursor };
}
