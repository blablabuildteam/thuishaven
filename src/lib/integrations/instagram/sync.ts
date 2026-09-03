import { getDb, hasDatabase } from "@/lib/db/client";
import { marketingPosts } from "@/lib/db/schema";
import {
  fetchInstagramMediaInsights,
  listInstagramMedia,
  metaIgBusinessId,
  pickInstagramStillUrl,
} from "@/lib/integrations/instagram/client";
import {
  hasBlobToken,
  storeRemoteMediaAsBlob,
} from "@/lib/integrations/social/blob";
import { socialSyncSince } from "@/lib/integrations/social/sync-window";
import { logIntegration } from "@/lib/integrations/log";

export type InstagramSyncResult = {
  ok: boolean;
  fetched: number;
  upserted: number;
  blobStored: number;
  insightsOk: number;
  analyzed?: number;
  error?: string;
  notes: string[];
};

function titleFromCaption(caption: string | undefined): string | null {
  if (!caption?.trim()) return null;
  const line = caption.trim().split(/\n/)[0] ?? "";
  return line.slice(0, 120) || null;
}

/**
 * Read-only Instagram Graph sync → marketing_posts.
 * Stills only (image / thumbnail / carousel first child). Vision analysis is fase D.
 */
export async function syncInstagramReadOnly(options?: {
  limit?: number;
  since?: Date | null;
  withInsights?: boolean;
  withBlob?: boolean;
  withAnalyze?: boolean;
}): Promise<InstagramSyncResult> {
  const notes: string[] = [];
  if (!process.env.META_ACCESS_TOKEN?.trim()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      blobStored: 0,
      insightsOk: 0,
      error: "META_ACCESS_TOKEN ontbreekt",
      notes,
    };
  }
  if (!metaIgBusinessId()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      blobStored: 0,
      insightsOk: 0,
      error: "META_IG_BUSINESS_ID ontbreekt",
      notes,
    };
  }
  if (!hasDatabase()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      blobStored: 0,
      insightsOk: 0,
      error: "DATABASE_URL ontbreekt",
      notes,
    };
  }

  const since =
    options?.since === null
      ? undefined
      : (options?.since ?? socialSyncSince());
  const listed = await listInstagramMedia({
    limit: options?.limit,
    since,
  });
  if (!listed.ok) {
    await logIntegration({
      source: "instagram",
      level: "error",
      event: "sync.failed",
      message: listed.error,
      throttleMs: 0,
    }).catch(() => null);
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      blobStored: 0,
      insightsOk: 0,
      analyzed: 0,
      error: listed.error,
      notes,
    };
  }

  const withInsights = options?.withInsights !== false;
  const withBlob = options?.withBlob !== false && hasBlobToken();
  if (!hasBlobToken()) {
    notes.push(
      "Geen BLOB_READ_WRITE_TOKEN — CDN-URL’s worden bewaard (kunnen verlopen).",
    );
  }

  const db = getDb();
  let upserted = 0;
  let blobStored = 0;
  let insightsOk = 0;
  const errors: string[] = [];

  for (const item of listed.media) {
    try {
      const still = pickInstagramStillUrl(item);
      let storedMediaUrl: string | null = null;
      if (withBlob && still.mediaUrl) {
        const stored = await storeRemoteMediaAsBlob({
          sourceUrl: still.mediaUrl,
          pathname: `instagram/${item.id}.jpg`,
        });
        if (stored.ok) {
          storedMediaUrl = stored.url;
          blobStored += 1;
        } else {
          notes.push(`Blob ${item.id}: ${stored.error}`);
        }
      }

      let reach = 0;
      let impressions = 0;
      const likeCount = item.like_count ?? 0;
      const commentCount = item.comments_count ?? 0;
      let engagement = likeCount + commentCount;
      if (withInsights) {
        const insights = await fetchInstagramMediaInsights(
          item.id,
          item.media_type,
        );
        if (insights.reach || insights.impressions || insights.engagement) {
          insightsOk += 1;
          reach = insights.reach;
          impressions = insights.impressions;
          if (insights.engagement > 0) engagement = insights.engagement;
        }
      }

      const publishedAt = item.timestamp ? new Date(item.timestamp) : null;
      const caption = item.caption?.slice(0, 4000) ?? null;

      await db
        .insert(marketingPosts)
        .values({
          channel: "instagram",
          externalId: item.id,
          title: titleFromCaption(item.caption),
          caption,
          permalink: item.permalink ?? null,
          publishedAt:
            publishedAt && !Number.isNaN(publishedAt.getTime())
              ? publishedAt
              : null,
          reach,
          impressions,
          engagement,
          clicks: 0,
          likeCount,
          commentCount,
          shareCount: 0,
          mediaUrl: still.mediaUrl,
          thumbnailUrl: still.thumbnailUrl,
          storedMediaUrl,
          videoUrl: still.videoUrl,
          visualFeatures: {
            format: still.format,
          },
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marketingPosts.channel, marketingPosts.externalId],
          set: {
            title: titleFromCaption(item.caption),
            caption,
            permalink: item.permalink ?? null,
            publishedAt:
              publishedAt && !Number.isNaN(publishedAt.getTime())
                ? publishedAt
                : null,
            reach,
            impressions,
            engagement,
            likeCount,
            commentCount,
            mediaUrl: still.mediaUrl,
            thumbnailUrl: still.thumbnailUrl,
            videoUrl: still.videoUrl,
            ...(storedMediaUrl ? { storedMediaUrl } : {}),
            syncedAt: new Date(),
          },
        });
      upserted += 1;
    } catch (e) {
      errors.push(
        `${item.id}: ${e instanceof Error ? e.message : "upsert mislukt"}`,
      );
    }
  }

  const ok = upserted > 0 || listed.media.length === 0;

  let analyzed = 0;
  if (ok && options?.withAnalyze !== false) {
    try {
      const { analyzePendingMarketingPosts } = await import(
        "@/lib/integrations/social/analyze"
      );
      const vision = await analyzePendingMarketingPosts({ limit: 6 });
      analyzed = vision.analyzed;
      if (vision.error) notes.push(`Vision: ${vision.error}`);
    } catch (e) {
      notes.push(
        `Vision: ${e instanceof Error ? e.message : "analyse mislukt"}`,
      );
    }
  }

  if (ok) {
    try {
      const { linkPostsToEditions } = await import(
        "@/lib/marketing/edition-link"
      );
      const linked = await linkPostsToEditions({ limit: 40 });
      if (linked.linked > 0) {
        notes.push(`${linked.linked} posts → edities`);
      }
    } catch {
      /* non-fatal */
    }
  }

  await logIntegration({
    source: "instagram",
    level: ok ? "info" : "error",
    event: ok ? "sync.ok" : "sync.failed",
    message: ok
      ? `Instagram sync: ${upserted}/${listed.media.length} posts · ${blobStored} blob · ${insightsOk} insights · ${analyzed} vision`
      : errors[0] ?? "Instagram sync mislukt",
    detail: {
      fetched: listed.media.length,
      upserted,
      blobStored,
      insightsOk,
      analyzed,
      errors: errors.slice(0, 5),
    },
    throttleMs: 0,
  }).catch(() => null);

  return {
    ok,
    fetched: listed.media.length,
    upserted,
    blobStored,
    insightsOk,
    analyzed,
    error: ok ? undefined : errors[0] ?? "Geen posts opgeslagen",
    notes: [...notes, ...errors.slice(0, 3)],
  };
}
