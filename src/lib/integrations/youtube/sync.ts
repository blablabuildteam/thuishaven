import { getDb, hasDatabase } from "@/lib/db/client";
import { marketingPosts } from "@/lib/db/schema";
import {
  listChannelVideos,
  pickYouTubeStillUrl,
  youtubeApiKey,
} from "@/lib/integrations/youtube/client";
import {
  hasBlobToken,
  storeRemoteMediaAsBlob,
} from "@/lib/integrations/social/blob";
import { socialSyncSince } from "@/lib/integrations/social/sync-window";
import { logIntegration } from "@/lib/integrations/log";

export type YouTubeSyncResult = {
  ok: boolean;
  fetched: number;
  upserted: number;
  blobStored: number;
  analyzed?: number;
  channelTitle?: string;
  error?: string;
  notes: string[];
};

/**
 * Read-only YouTube Data API sync → marketing_posts.
 */
export async function syncYouTubeReadOnly(options?: {
  limit?: number;
  since?: Date | null;
  withBlob?: boolean;
  withAnalyze?: boolean;
}): Promise<YouTubeSyncResult> {
  const notes: string[] = [];
  if (!youtubeApiKey()) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      blobStored: 0,
      error: "YOUTUBE_API_KEY ontbreekt",
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
  const listed = await listChannelVideos({
    limit: options?.limit,
    since,
  });
  if (!listed.ok) {
    await logIntegration({
      source: "youtube",
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
      "Geen BLOB_READ_WRITE_TOKEN — YouTube thumbnails worden als CDN-URL bewaard.",
    );
  }

  const db = getDb();
  let upserted = 0;
  let blobStored = 0;
  const errors: string[] = [];

  for (const video of listed.videos) {
    try {
      const still = pickYouTubeStillUrl(video);
      let storedMediaUrl: string | null = null;
      if (withBlob && still.mediaUrl) {
        const stored = await storeRemoteMediaAsBlob({
          sourceUrl: still.mediaUrl,
          pathname: `youtube/${video.id}.jpg`,
        });
        if (stored.ok) {
          storedMediaUrl = stored.url;
          blobStored += 1;
        } else {
          notes.push(`Blob ${video.id}: ${stored.error}`);
        }
      }

      const publishedAt = video.publishedAt
        ? new Date(video.publishedAt)
        : null;
      const caption = video.description.slice(0, 4000) || null;
      const impressions = video.viewCount;
      const likeCount = video.likeCount;
      const commentCount = video.commentCount;
      const engagement = likeCount + commentCount;

      await db
        .insert(marketingPosts)
        .values({
          channel: "youtube",
          externalId: video.id,
          title: video.title.slice(0, 200) || null,
          caption,
          permalink: `https://www.youtube.com/watch?v=${video.id}`,
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
          shareCount: 0,
          mediaUrl: still.mediaUrl,
          thumbnailUrl: still.thumbnailUrl,
          storedMediaUrl,
          visualFeatures: { format: still.format },
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marketingPosts.channel, marketingPosts.externalId],
          set: {
            title: video.title.slice(0, 200) || null,
            caption,
            permalink: `https://www.youtube.com/watch?v=${video.id}`,
            publishedAt:
              publishedAt && !Number.isNaN(publishedAt.getTime())
                ? publishedAt
                : null,
            impressions,
            engagement,
            likeCount,
            commentCount,
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
        channel: "youtube",
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
    source: "youtube",
    level: ok ? "info" : "error",
    event: ok ? "sync.ok" : "sync.failed",
    message: ok
      ? `YouTube sync: ${upserted}/${listed.videos.length} video's · ${blobStored} blob · ${analyzed} vision (${listed.channel.title})`
      : errors[0] ?? "YouTube sync mislukt",
    detail: {
      fetched: listed.videos.length,
      upserted,
      blobStored,
      analyzed,
      channelTitle: listed.channel.title,
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
    channelTitle: listed.channel.title,
    error: ok ? undefined : errors[0] ?? "Geen video's opgeslagen",
    notes: [...notes, ...errors.slice(0, 3)],
  };
}
