import { assertExternalReadOnly } from "@/lib/integrations/read-only";
import { ensureTikTokAccessToken } from "@/lib/integrations/tiktok/tokens";

const API = "https://open.tiktokapis.com";

export type TikTokUserInfo = {
  openId: string | null;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
};

export type TikTokVideo = {
  id: string;
  title: string | null;
  description: string | null;
  createTime: number;
  coverImageUrl: string | null;
  shareUrl: string | null;
  duration: number | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
};

type TikTokError = { code?: string; message?: string };

async function withToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  return ensureTikTokAccessToken();
}

async function tiktokGet<T>(
  path: string,
  fields: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const ensured = await withToken();
  if (!ensured.ok) return ensured;

  const run = async (token: string) => {
    const qs = new URLSearchParams({ fields });
    const url = `${API}${path}?${qs}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: T;
      error?: TikTokError;
    };
    return { res, json };
  };

  try {
    let { res, json } = await run(ensured.token);
    const expired =
      json.error?.code === "access_token_invalid" || res.status === 401;
    if (expired) {
      const retried = await ensureTikTokAccessToken({ force: true });
      if (!retried.ok) return retried;
      ({ res, json } = await run(retried.token));
    }

    const errCode = json.error?.code;
    if (!res.ok || (errCode && errCode !== "ok")) {
      return {
        ok: false,
        error:
          json.error?.message ??
          `TikTok HTTP ${res.status}: ${JSON.stringify(json).slice(0, 180)}`,
      };
    }
    if (!json.data) {
      return { ok: false, error: "Geen data in TikTok-response" };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "TikTok network error",
    };
  }
}

async function tiktokPostRead<T>(
  path: string,
  fields: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const ensured = await withToken();
  if (!ensured.ok) return ensured;

  const url = `${API}${path}?${new URLSearchParams({ fields })}`;
  assertExternalReadOnly("POST", url, { allowTikTokReadPost: true });

  const run = async (token: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: T;
      error?: TikTokError;
    };
    return { res, json };
  };

  try {
    let { res, json } = await run(ensured.token);
    const expired =
      json.error?.code === "access_token_invalid" || res.status === 401;
    if (expired) {
      const retried = await ensureTikTokAccessToken({ force: true });
      if (!retried.ok) return retried;
      ({ res, json } = await run(retried.token));
    }

    const errCode = json.error?.code;
    if (!res.ok || (errCode && errCode !== "ok")) {
      return {
        ok: false,
        error:
          json.error?.message ??
          `TikTok HTTP ${res.status}: ${JSON.stringify(json).slice(0, 180)}`,
      };
    }
    if (!json.data) {
      return { ok: false, error: "Geen data in TikTok-response" };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "TikTok network error",
    };
  }
}

export async function getUserInfo(): Promise<
  { ok: true; user: TikTokUserInfo } | { ok: false; error: string }
> {
  const result = await tiktokGet<{
    user?: {
      open_id?: string;
      display_name?: string;
      username?: string;
      avatar_url?: string;
      follower_count?: number;
      following_count?: number;
      likes_count?: number;
      video_count?: number;
    };
  }>(
    "/v2/user/info/",
    "open_id,display_name,username,avatar_url,follower_count,following_count,likes_count,video_count",
  );
  if (!result.ok) return result;

  const u = result.data.user;
  if (!u) return { ok: false, error: "Geen user-object in TikTok-response" };

  return {
    ok: true,
    user: {
      openId: u.open_id ?? null,
      displayName: u.display_name ?? null,
      username: u.username ?? null,
      avatarUrl: u.avatar_url ?? null,
      followerCount: u.follower_count ?? 0,
      followingCount: u.following_count ?? 0,
      likesCount: u.likes_count ?? 0,
      videoCount: u.video_count ?? 0,
    },
  };
}

type VideoListPage = {
  videos?: Array<{
    id?: string;
    title?: string;
    video_description?: string;
    create_time?: number;
    cover_image_url?: string;
    share_url?: string;
    duration?: number;
    view_count?: number;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
  }>;
  cursor?: number;
  has_more?: boolean;
};

function mapVideo(
  v: NonNullable<VideoListPage["videos"]>[number],
): TikTokVideo | null {
  if (!v.id) return null;
  return {
    id: v.id,
    title: v.title ?? null,
    description: v.video_description ?? null,
    createTime: v.create_time ?? 0,
    coverImageUrl: v.cover_image_url ?? null,
    shareUrl: v.share_url ?? null,
    duration: v.duration ?? null,
    viewCount: v.view_count ?? 0,
    likeCount: v.like_count ?? 0,
    commentCount: v.comment_count ?? 0,
    shareCount: v.share_count ?? 0,
  };
}

const VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "create_time",
  "cover_image_url",
  "share_url",
  "duration",
  "view_count",
  "like_count",
  "comment_count",
  "share_count",
].join(",");

/** Paginate Display API video list (max 20 per page). */
export async function listTikTokVideos(options?: {
  limit?: number;
}): Promise<{ ok: true; videos: TikTokVideo[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  const videos: TikTokVideo[] = [];
  let cursor: number | undefined;

  while (videos.length < limit) {
    const pageSize = Math.min(20, limit - videos.length);
    const body: Record<string, unknown> = { max_count: pageSize };
    if (cursor != null) body.cursor = cursor;

    const result = await tiktokPostRead<VideoListPage>(
      "/v2/video/list/",
      VIDEO_FIELDS,
      body,
    );
    if (!result.ok) return result;

    for (const raw of result.data.videos ?? []) {
      const mapped = mapVideo(raw);
      if (mapped) videos.push(mapped);
    }

    if (!result.data.has_more) break;
    cursor = result.data.cursor;
    if (cursor == null) break;
  }

  return { ok: true, videos };
}

export function pickTikTokStillUrl(video: TikTokVideo): {
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  format: string;
} {
  return {
    mediaUrl: video.coverImageUrl,
    thumbnailUrl: video.coverImageUrl,
    format: "vertical-video",
  };
}
