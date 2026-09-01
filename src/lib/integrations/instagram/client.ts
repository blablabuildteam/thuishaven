import { ensureMetaAccessToken } from "@/lib/integrations/meta/tokens";

const DEFAULT_VERSION = "v21.0";

export function metaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_VERSION;
}

export function metaIgBusinessId(): string | null {
  return process.env.META_IG_BUSINESS_ID?.trim() || null;
}

export type IgMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;

export type IgMediaChild = {
  id?: string;
  media_type?: IgMediaType;
  media_url?: string;
  thumbnail_url?: string;
};

export type IgMediaItem = {
  id: string;
  caption?: string;
  media_type?: IgMediaType;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  children?: { data?: IgMediaChild[] };
};

type GraphError = { message?: string; type?: string; code?: number };

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const ensured = await ensureMetaAccessToken();
  if (!ensured.ok) return { ok: false, error: ensured.error };
  const token = ensured.token;

  const qs = new URLSearchParams({ ...params, access_token: token });
  const version = metaGraphVersion();
  const url = `https://graph.facebook.com/${version}/${path.replace(/^\//, "")}?${qs}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json()) as T & { error?: GraphError };
    if (!res.ok || json.error?.message) {
      return {
        ok: false,
        error:
          json.error?.message ??
          `Meta HTTP ${res.status}: ${JSON.stringify(json).slice(0, 180)}`,
      };
    }
    return { ok: true, data: json };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Meta network error",
    };
  }
}

/** Recent media for the configured IG business account. */
export async function listInstagramMedia(options?: {
  limit?: number;
}): Promise<{ ok: true; media: IgMediaItem[] } | { ok: false; error: string }> {
  const igId = metaIgBusinessId();
  if (!igId) return { ok: false, error: "META_IG_BUSINESS_ID ontbreekt" };

  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  const fields = [
    "id",
    "caption",
    "media_type",
    "media_url",
    "thumbnail_url",
    "permalink",
    "timestamp",
    "like_count",
    "comments_count",
    "children{media_type,media_url,thumbnail_url}",
  ].join(",");

  const result = await graphGet<{ data?: IgMediaItem[]; paging?: unknown }>(
    `${encodeURIComponent(igId)}/media`,
    { fields, limit: String(limit) },
  );
  if (!result.ok) return result;
  return { ok: true, media: result.data.data ?? [] };
}

export type IgMediaInsights = {
  reach: number;
  impressions: number;
  engagement: number;
};

/** Best-effort insights; missing permissions → zeros, not failure.
 * Meta removed `impressions` (v22+); use `views` for feed + reels.
 */
export async function fetchInstagramMediaInsights(
  mediaId: string,
  _mediaType?: IgMediaType,
): Promise<IgMediaInsights> {
  const empty = { reach: 0, impressions: 0, engagement: 0 };
  const metrics = "reach,views,total_interactions";

  const result = await graphGet<{
    data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
  }>(`${encodeURIComponent(mediaId)}/insights`, { metric: metrics });

  if (!result.ok) return empty;

  const out = { ...empty };
  for (const row of result.data.data ?? []) {
    const value = Number(row.values?.[0]?.value ?? 0) || 0;
    if (row.name === "reach") out.reach = value;
    if (row.name === "views" || row.name === "impressions" || row.name === "plays") {
      out.impressions = Math.max(out.impressions, value);
    }
    if (row.name === "total_interactions" || row.name === "engagement") {
      out.engagement = value;
    }
  }
  return out;
}

/** Prefer a durable still: image URL, video thumbnail, or first carousel child. */
export function pickInstagramStillUrl(item: IgMediaItem): {
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  format: string;
} {
  const type = (item.media_type ?? "IMAGE").toUpperCase();
  if (type === "IMAGE") {
    return {
      mediaUrl: item.media_url ?? null,
      thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
      videoUrl: null,
      format: "image",
    };
  }
  if (type === "VIDEO" || type === "REELS") {
    return {
      mediaUrl: item.thumbnail_url ?? item.media_url ?? null,
      thumbnailUrl: item.thumbnail_url ?? null,
      videoUrl: item.media_url ?? null,
      format: type === "REELS" ? "reel" : "video",
    };
  }
  if (type === "CAROUSEL_ALBUM") {
    const children = item.children?.data ?? [];
    const firstVideo = children.find(
      (c) => c.media_type === "VIDEO" || c.media_type === "REELS",
    );
    const firstImage = children.find((c) => c.media_type === "IMAGE");
    const first = firstImage ?? firstVideo ?? children[0];
    return {
      mediaUrl: first?.media_url ?? item.media_url ?? null,
      thumbnailUrl:
        first?.thumbnail_url ?? first?.media_url ?? item.thumbnail_url ?? null,
      videoUrl: firstVideo?.media_url ?? null,
      format: "carousel",
    };
  }
  return {
    mediaUrl: item.media_url ?? item.thumbnail_url ?? null,
    thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
    videoUrl: null,
    format: type.toLowerCase(),
  };
}
