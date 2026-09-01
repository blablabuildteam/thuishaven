import { desc, eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  marketingPosts,
  type MarketingVisualFeatures,
} from "@/lib/db/schema";
import {
  aggregateLiftByFeature,
  ticketLiftByPostIds,
  type CreativeLiftAggregate,
  type TicketLift,
} from "@/lib/marketing/ticket-lift";

export type MarketingPostRow = {
  id: string;
  channel: "instagram" | "tiktok" | "youtube" | "brevo" | "other";
  editionId: string | null;
  externalId: string | null;
  title: string | null;
  caption: string | null;
  permalink: string | null;
  publishedAt: string | null;
  reach: number;
  impressions: number;
  engagement: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  storedMediaUrl: string | null;
  videoUrl: string | null;
  visualFeatures: MarketingVisualFeatures | null;
  analyzedAt: string | null;
  syncedAt: string | null;
  ticketLift: TicketLift | null;
};

export type MarketingPostsBundle = {
  posts: MarketingPostRow[];
  aggregates: CreativeLiftAggregate[];
  analyzedCount: number;
  /** Newest syncedAt among returned posts — for view auto-refresh. */
  lastSyncedAt: string | null;
};

export const loadRecentMarketingPosts = cache(
  async (options?: {
    limit?: number;
    channel?: "instagram" | "tiktok" | "youtube";
    withLift?: boolean;
  }): Promise<MarketingPostRow[]> => {
    const bundle = await loadMarketingPostsBundle(options);
    return bundle.posts;
  },
);

export const loadMarketingPostsBundle = cache(
  async (options?: {
    limit?: number;
    channel?: "instagram" | "tiktok" | "youtube";
    withLift?: boolean;
  }): Promise<MarketingPostsBundle> => {
    if (!hasDatabase()) {
      return { posts: [], aggregates: [], analyzedCount: 0, lastSyncedAt: null };
    }
    const db = getDb();
    const limit = options?.limit ?? 24;
    const rows = options?.channel
      ? await db
          .select()
          .from(marketingPosts)
          .where(eq(marketingPosts.channel, options.channel))
          .orderBy(desc(marketingPosts.publishedAt))
          .limit(limit)
      : await db
          .select()
          .from(marketingPosts)
          .orderBy(desc(marketingPosts.publishedAt))
          .limit(limit);

    const withLift = options?.withLift !== false;
    const lifts = withLift
      ? await ticketLiftByPostIds(
          rows.map((r) => ({
            id: r.id,
            publishedAt: r.publishedAt?.toISOString() ?? null,
            editionId: r.editionId,
          })),
        )
      : new Map<string, TicketLift>();

    const posts: MarketingPostRow[] = rows.map((r) => ({
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

    const aggregates = aggregateLiftByFeature(
      posts.map((p) => ({
        offer: p.visualFeatures?.offer ?? null,
        format: p.visualFeatures?.format ?? null,
        hasTextOverlay: p.visualFeatures?.hasTextOverlay ?? null,
        lift: p.ticketLift?.sold ?? null,
      })),
    );

    let lastSyncedAt: string | null = null;
    for (const p of posts) {
      if (!p.syncedAt) continue;
      if (!lastSyncedAt || p.syncedAt > lastSyncedAt) lastSyncedAt = p.syncedAt;
    }

    return {
      posts,
      aggregates,
      analyzedCount: posts.filter((p) => p.analyzedAt).length,
      lastSyncedAt,
    };
  },
);
