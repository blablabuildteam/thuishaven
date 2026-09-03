import { getDb, hasDatabase } from "@/lib/db/client";
import { marketingPosts } from "@/lib/db/schema";
import {
  listTikTokVideos,
  pickTikTokStillUrl,
} from "@/lib/integrations/tiktok/client";
import {
  hasBlobToken,
  storeRemoteMediaAsBlob,
} from "@/lib/integrations/social/blob";
import { socialSyncSince } from "@/lib/integrations/social/sync-window";
import { logIntegration } from "@/lib/integrations/log";

export type TikTokSyncResult = {
  ok: boolean;
  fetched: number;
  upserted: number;
  blobStored: number;
  analyzed?: number;
  error?: string;
  notes: string[];
};

function titleFromVideo(title: string | null, description: string | null): string | null {
  const raw = (title ?? description ?? "").trim();
  if (!raw) return null;
  return raw.split(/\n/)[0]?.slice(0, 120) || null;
}

/**
 * Read-only TikTok Display API sync → marketing_posts.
 * Cover images expire ~6h — Blob strongly recommended.
 */
export async function syncTikTokReadOnly(options?: {
  limit?: number;
  since?: Date | null;
  withBlob?: boolean;
  withAnalyze?: boolean;
}): Promise<TikTokSyncResult> {
  const notes: string[] = [];
  if (
    !process.env.TIKTOK_ACCESS_TOKEN?.trim() &&
    !process.env.TIKTOK_REFRESH_TOKEN?.trim()
  ) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      blobStored: 0,
      error: "TIKTOK_ACCESS_TOKEN of TIKTOK_REFRESH_TOKEN ontbreekt",
      notes,
    };
  }
  if (!hasDatabase()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      blobStored: 0,
      error: "DATABASE_URL ontbreekt",
      notes,
    };
  }

  const since =
    options?.since === null
      ? undefined
      : (options?.since ?? socialSyncSince());
  const listed = await listTikTokVideos({
    limit: options?.limit,
    since,
  });
  if (!listed.ok) {
    await logIntegration({
      source: "tiktok",
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
      analyzed: 0,
      error: listed.error,
      notes,
    };
  }

  const withBlob = options?.withBlob !== false && hasBlobToken();
  if (!hasBlobToken()) {
    notes.push(
      "Geen BLOB_READ_WRITE_TOKEN — TikTok covers verlopen ~6u; sync opnieuw of voeg Blob toe.",
    );
  }

  const db = getDb();
  let upserted = 0;
  let blobStored = 0;
  const errors: string[] = [];

  for (const video of listed.videos) {
    try {
      const still = pickTikTokStillUrl(video);
      let storedMediaUrl: string | null = null;
      if (withBlob && still.mediaUrl) {
        const stored = await storeRemoteMediaAsBlob({
          sourceUrl: still.mediaUrl,
          pathname: `tiktok/${video.id}.jpg`,
        });
        if (stored.ok) {
          storedMediaUrl = stored.url;
          blobStored += 1;
        } else {
          notes.push(`Blob ${video.id}: ${stored.error}`);
        }
      }

      const publishedAt =
        video.createTime > 0 ? new Date(video.createTime * 1000) : null;
      const caption =
        (video.description ?? video.title)?.slice(0, 4000) ?? null;
      const impressions = video.viewCount;
      const likeCount = video.likeCount;
      const commentCount = video.commentCount;
      const shareCount = video.shareCount;
      const engagement = likeCount + commentCount + shareCount;

      await db
        .insert(marketingPosts)
        .values({
          channel: "tiktok",
          externalId: video.id,
          title: titleFromVideo(video.title, video.description),
          caption,
          permalink: video.shareUrl,
          publishedAt:
            publishedAt && !Number.isNaN(publishedAt.getTime())
              ? publishedAt
              : null,
          reach: 0,
          impressions,
          engagement,
          clicks: 0,
          likeCount,
          commentCount,
          shareCount,
          mediaUrl: still.mediaUrl,
          thumbnailUrl: still.thumbnailUrl,
          storedMediaUrl,
          visualFeatures: { format: still.format },
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marketingPosts.channel, marketingPosts.externalId],
          set: {
            title: titleFromVideo(video.title, video.description),
            caption,
            permalink: video.shareUrl,
            publishedAt:
              publishedAt && !Number.isNaN(publishedAt.getTime())
                ? publishedAt
                : null,
            impressions,
            engagement,
            likeCount,
            commentCount,
            shareCount,
            mediaUrl: still.mediaUrl,
            thumbnailUrl: still.thumbnailUrl,
            ...(storedMediaUrl ? { storedMediaUrl } : {}),
            syncedAt: new Date(),
          },
        });
      upserted += 1;
    } catch (e) {
      errors.push(
        `${video.id}: ${e instanceof Error ? e.message : "upsert mislukt"}`,
      );
    }
  }

  const ok = upserted > 0 || listed.videos.length === 0;

  let analyzed = 0;
  if (ok && options?.withAnalyze !== false) {
    try {
      const { analyzePendingMarketingPosts } = await import(
        "@/lib/integrations/social/analyze"
      );
      const vision = await analyzePendingMarketingPosts({
        limit: 6,
        channel: "tiktok",
      });
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
    source: "tiktok",
    level: ok ? "info" : "error",
    event: ok ? "sync.ok" : "sync.failed",
    message: ok
      ? `TikTok sync: ${upserted}/${listed.videos.length} video's · ${blobStored} blob · ${analyzed} vision`
      : errors[0] ?? "TikTok sync mislukt",
    detail: {
      fetched: listed.videos.length,
      upserted,
      blobStored,
      analyzed,
      errors: errors.slice(0, 5),
    },
    throttleMs: 0,
  }).catch(() => null);

  return {
    ok,
    fetched: listed.videos.length,
    upserted,
    blobStored,
    analyzed,
    error: ok ? undefined : errors[0] ?? "Geen video's opgeslagen",
    notes: [...notes, ...errors.slice(0, 3)],
  };
}
