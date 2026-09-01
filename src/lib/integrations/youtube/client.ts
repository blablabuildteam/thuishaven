const THUISHAVEN_YOUTUBE_CHANNEL_ID = "UC2KhiKAhm8wIkjt2chtIUTA";
const API = "https://www.googleapis.com/youtube/v3";

export function youtubeApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

export function youtubeChannelId(): string {
  return (
    process.env.YOUTUBE_CHANNEL_ID?.trim() || THUISHAVEN_YOUTUBE_CHANNEL_ID
  );
}

export type YouTubeChannelStats = {
  id: string;
  title: string;
  description: string | null;
  customUrl: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  uploadsPlaylistId: string | null;
};

export type YouTubeVideo = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

type YtError = { error?: { message?: string; code?: number } };

async function ytGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = youtubeApiKey();
  if (!key) return { ok: false, error: "YOUTUBE_API_KEY ontbreekt" };

  const qs = new URLSearchParams({ ...params, key });
  const url = `${API}/${path.replace(/^\//, "")}?${qs}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json()) as T & YtError;
    if (!res.ok || json.error?.message) {
      return {
        ok: false,
        error:
          json.error?.message ??
          `YouTube HTTP ${res.status}: ${JSON.stringify(json).slice(0, 180)}`,
      };
    }
    return { ok: true, data: json };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "YouTube network error",
    };
  }
}

function num(v: string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Parse ISO-8601 duration (PT1H2M3S) → seconds. */
export function parseIsoDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return h * 3600 + min * 60 + s;
}

function pickThumb(
  thumbs:
    | {
        maxres?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      }
    | undefined,
): string | null {
  return (
    thumbs?.maxres?.url ??
    thumbs?.high?.url ??
    thumbs?.medium?.url ??
    thumbs?.default?.url ??
    null
  );
}

export async function getChannelStats(): Promise<
  { ok: true; channel: YouTubeChannelStats } | { ok: false; error: string }
> {
  const channelId = youtubeChannelId();
  const result = await ytGet<{
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        description?: string;
        customUrl?: string;
        thumbnails?: {
          high?: { url?: string };
          medium?: { url?: string };
          default?: { url?: string };
        };
      };
      statistics?: {
        subscriberCount?: string;
        viewCount?: string;
        videoCount?: string;
      };
      contentDetails?: {
        relatedPlaylists?: { uploads?: string };
      };
    }>;
  }>("channels", {
    part: "snippet,statistics,contentDetails",
    id: channelId,
  });
  if (!result.ok) return result;

  const item = result.data.items?.[0];
  if (!item?.id) {
    return { ok: false, error: "Kanaal niet gevonden — check YOUTUBE_CHANNEL_ID" };
  }

  return {
    ok: true,
    channel: {
      id: item.id,
      title: item.snippet?.title ?? "YouTube",
      description: item.snippet?.description ?? null,
      customUrl: item.snippet?.customUrl ?? null,
      thumbnailUrl: pickThumb(item.snippet?.thumbnails),
      subscriberCount: num(item.statistics?.subscriberCount),
      viewCount: num(item.statistics?.viewCount),
      videoCount: num(item.statistics?.videoCount),
      uploadsPlaylistId:
        item.contentDetails?.relatedPlaylists?.uploads ?? null,
    },
  };
}

async function listUploadVideoIds(
  uploadsPlaylistId: string,
  limit: number,
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < limit) {
    const pageSize = Math.min(50, limit - ids.length);
    const params: Record<string, string> = {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(pageSize),
    };
    if (pageToken) params.pageToken = pageToken;

    const result = await ytGet<{
      items?: Array<{ contentDetails?: { videoId?: string } }>;
      nextPageToken?: string;
    }>("playlistItems", params);
    if (!result.ok) return result;

    for (const item of result.data.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = result.data.nextPageToken;
    if (!pageToken) break;
  }

  return { ok: true, ids };
}

export async function getVideoDetails(
  videoIds: string[],
): Promise<{ ok: true; videos: YouTubeVideo[] } | { ok: false; error: string }> {
  if (videoIds.length === 0) return { ok: true, videos: [] };

  const videos: YouTubeVideo[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const result = await ytGet<{
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          description?: string;
          publishedAt?: string;
          thumbnails?: {
            maxres?: { url?: string };
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
        contentDetails?: { duration?: string };
      }>;
    }>("videos", {
      part: "snippet,statistics,contentDetails",
      id: batch.join(","),
    });
    if (!result.ok) return result;

    for (const item of result.data.items ?? []) {
      if (!item.id) continue;
      videos.push({
        id: item.id,
        title: item.snippet?.title ?? "Zonder titel",
        description: item.snippet?.description ?? "",
        publishedAt: item.snippet?.publishedAt ?? "",
        thumbnailUrl: pickThumb(item.snippet?.thumbnails),
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        viewCount: num(item.statistics?.viewCount),
        likeCount: num(item.statistics?.likeCount),
        commentCount: num(item.statistics?.commentCount),
      });
    }
  }

  return { ok: true, videos };
}

/** Recent channel uploads with public stats. */
export async function listChannelVideos(options?: {
  limit?: number;
}): Promise<
  | { ok: true; channel: YouTubeChannelStats; videos: YouTubeVideo[] }
  | { ok: false; error: string }
> {
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  const channelResult = await getChannelStats();
  if (!channelResult.ok) return channelResult;

  const uploadsId = channelResult.channel.uploadsPlaylistId;
  if (!uploadsId) {
    return {
      ok: false,
      error: "Geen uploads-playlist op dit kanaal",
    };
  }

  const idsResult = await listUploadVideoIds(uploadsId, limit);
  if (!idsResult.ok) return idsResult;

  const videosResult = await getVideoDetails(idsResult.ids);
  if (!videosResult.ok) return videosResult;

  return {
    ok: true,
    channel: channelResult.channel,
    videos: videosResult.videos,
  };
}

export function pickYouTubeStillUrl(video: YouTubeVideo): {
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  format: string;
} {
  const isShort =
    video.durationSeconds != null && video.durationSeconds > 0
      ? video.durationSeconds < 60
      : /#shorts\b/i.test(video.title) || /#shorts\b/i.test(video.description);
  return {
    mediaUrl: video.thumbnailUrl,
    thumbnailUrl: video.thumbnailUrl,
    format: isShort ? "short" : "landscape-video",
  };
}
