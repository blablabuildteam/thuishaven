/**
 * Apify client for Instagram / TikTok public metrics + recent posts.
 *
 * Expected env:
 * - APIFY_TOKEN
 * - APIFY_INSTAGRAM_ACTOR_ID (default: apify/instagram-scraper)
 * - APIFY_TIKTOK_ACTOR_ID (optional)
 */

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN?.trim());
}

export async function verifyApify(): Promise<{ ok: boolean; detail: string }> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return { ok: false, detail: "APIFY_TOKEN ontbreekt" };
  try {
    const res = await fetch("https://api.apify.com/v2/user/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, detail: `Apify HTTP ${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as {
      data?: { username?: string };
    };
    return {
      ok: true,
      detail: `OK · ${json.data?.username ?? "account"}`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "Apify network error",
    };
  }
}

export type SocialProfileFetch = {
  ok: true;
  followers: number | null;
  posts: Array<{
    id: string;
    caption: string;
    url: string | null;
    timestamp: string | null;
  }>;
  raw?: unknown;
};

export type SocialProfileFetchResult =
  | SocialProfileFetch
  | { ok: false; error: string };

export async function runSocialProfileFetch(input: {
  platform: "instagram" | "tiktok";
  handle: string;
  resultsLimit?: number;
}): Promise<SocialProfileFetchResult> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return { ok: false, error: "APIFY_TOKEN ontbreekt" };

  const handle = input.handle.replace(/^@/, "").trim();
  if (!handle) return { ok: false, error: "Handle ontbreekt" };

  if (input.platform === "tiktok") {
    const actorId =
      process.env.APIFY_TIKTOK_ACTOR_ID?.trim() || "clockworks/tiktok-scraper";
    return runActorAndParse({
      token,
      actorId,
      body: {
        profiles: [handle],
        resultsPerPage: input.resultsLimit ?? 5,
      },
      parse: parseTikTokItems,
    });
  }

  return runInstagramBatchFetch({
    handles: [handle],
    resultsLimit: input.resultsLimit ?? 12,
  });
}

/**
 * One Apify run for many IG handles — cheaper than 1 run per artist.
 * Returns a map handle → fetch result (best-effort from dataset rows).
 */
export async function runInstagramBatchFetch(input: {
  handles: string[];
  resultsLimit?: number;
}): Promise<SocialProfileFetchResult> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return { ok: false, error: "APIFY_TOKEN ontbreekt" };
  const handles = [
    ...new Set(
      input.handles.map((h) => h.replace(/^@/, "").trim()).filter(Boolean),
    ),
  ].slice(0, 40);
  if (handles.length === 0) return { ok: false, error: "Geen handles" };

  const actorId =
    process.env.APIFY_INSTAGRAM_ACTOR_ID?.trim() || "apify/instagram-scraper";
  return runActorAndParse({
    token,
    actorId,
    body: {
      directUrls: handles.map((h) => `https://www.instagram.com/${h}/`),
      resultsType: "posts",
      resultsLimit: input.resultsLimit ?? 5,
      searchLimit: handles.length,
    },
    parse: parseInstagramItems,
  });
}

/** Batch that also splits posts per owner username when possible. */
export async function runInstagramBatchByHandle(input: {
  handles: string[];
  resultsLimit?: number;
}): Promise<
  | {
      ok: true;
      byHandle: Record<string, SocialProfileFetch>;
      errors: string[];
    }
  | { ok: false; error: string }
> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return { ok: false, error: "APIFY_TOKEN ontbreekt" };
  const handles = [
    ...new Set(
      input.handles.map((h) => h.replace(/^@/, "").trim().toLowerCase()).filter(Boolean),
    ),
  ].slice(0, 40);
  if (handles.length === 0) return { ok: false, error: "Geen handles" };

  const actorId =
    process.env.APIFY_INSTAGRAM_ACTOR_ID?.trim() || "apify/instagram-scraper";
  const actorPath = actorId.replace(/\//g, "~");
  try {
    const start = await fetch(
      `https://api.apify.com/v2/acts/${actorPath}/runs?waitForFinish=120`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          directUrls: handles.map((h) => `https://www.instagram.com/${h}/`),
          resultsType: "posts",
          resultsLimit: input.resultsLimit ?? 5,
          searchLimit: handles.length,
        }),
        cache: "no-store",
      },
    );
    if (!start.ok) {
      const t = await start.text().catch(() => "");
      return {
        ok: false,
        error: `Apify start HTTP ${start.status}${t ? `: ${t.slice(0, 160)}` : ""}`,
      };
    }
    const startJson = (await start.json()) as {
      data?: { defaultDatasetId?: string };
    };
    const datasetId = startJson.data?.defaultDatasetId;
    if (!datasetId) return { ok: false, error: "Apify run zonder dataset" };

    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    if (!itemsRes.ok) {
      return { ok: false, error: `Apify dataset HTTP ${itemsRes.status}` };
    }
    const items = (await itemsRes.json()) as unknown[];
    if (!Array.isArray(items)) return { ok: false, error: "Ongeldige dataset" };

    const byHandle: Record<string, SocialProfileFetch> = {};
    for (const h of handles) {
      byHandle[h] = { ok: true, followers: null, posts: [] };
    }

    for (const raw of items) {
      const item = raw as Record<string, unknown>;
      const owner =
        str(
          (item.ownerUsername as string) ??
            (item.owner as Record<string, unknown> | undefined)?.username ??
            (item.inputUrl as string)?.match(/instagram\.com\/([^/?]+)/)?.[1],
        )?.toLowerCase() ?? null;
      const key =
        owner && byHandle[owner]
          ? owner
          : handles.find((h) =>
              str(item.url)?.toLowerCase().includes(`/${h}/`),
            ) ?? handles[0];
      if (!key || !byHandle[key]) continue;
      const bucket = byHandle[key]!;
      if (bucket.followers == null) {
        bucket.followers =
          num(item.followersCount) ??
          num(item.followers) ??
          num(
            (item.owner as Record<string, unknown> | undefined)?.followersCount,
          );
      }
      const caption = str(item.caption) ?? str(item.text) ?? "";
      const id =
        str(item.id) ?? str(item.shortCode) ?? str(item.url) ?? `ig-${bucket.posts.length}`;
      if (caption || item.url) {
        bucket.posts.push({
          id,
          caption,
          url: str(item.url) ?? null,
          timestamp: str(item.timestamp),
        });
      }
    }

    return { ok: true, byHandle, errors: [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Apify network error",
    };
  }
}

async function runActorAndParse(opts: {
  token: string;
  actorId: string;
  body: Record<string, unknown>;
  parse: (items: unknown[]) => SocialProfileFetch;
}): Promise<SocialProfileFetchResult> {
  const actorPath = opts.actorId.replace(/\//g, "~");
  try {
    const start = await fetch(
      `https://api.apify.com/v2/acts/${actorPath}/runs?waitForFinish=90`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(opts.body),
        cache: "no-store",
      },
    );
    if (!start.ok) {
      const t = await start.text().catch(() => "");
      return {
        ok: false,
        error: `Apify start HTTP ${start.status}${t ? `: ${t.slice(0, 160)}` : ""}`,
      };
    }
    const startJson = (await start.json()) as {
      data?: { defaultDatasetId?: string; status?: string };
    };
    const datasetId = startJson.data?.defaultDatasetId;
    if (!datasetId) {
      return {
        ok: false,
        error: `Apify run zonder dataset (${startJson.data?.status ?? "?"})`,
      };
    }

    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=1`,
      {
        headers: { Authorization: `Bearer ${opts.token}` },
        cache: "no-store",
      },
    );
    if (!itemsRes.ok) {
      return { ok: false, error: `Apify dataset HTTP ${itemsRes.status}` };
    }
    const items = (await itemsRes.json()) as unknown[];
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: "Apify leverde geen items" };
    }
    return opts.parse(items);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Apify network error",
    };
  }
}

function parseInstagramItems(items: unknown[]): SocialProfileFetch {
  const posts: SocialProfileFetch["posts"] = [];
  let followers: number | null = null;

  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    if (followers == null) {
      const f =
        num(item.followersCount) ??
        num(item.followers) ??
        num(
          (item.owner as Record<string, unknown> | undefined)?.followersCount,
        ) ??
        num((item.profileData as Record<string, unknown> | undefined)?.followersCount);
      if (f != null) followers = f;
    }
    const firstComment = Array.isArray(item.latestComments)
      ? item.latestComments[0]
      : null;
    const caption =
      str(item.caption) ??
      str(item.text) ??
      str(firstComment) ??
      "";
    const id =
      str(item.id) ??
      str(item.shortCode) ??
      str(item.url) ??
      `ig-${posts.length}`;
    if (caption || item.url) {
      posts.push({
        id,
        caption: typeof caption === "string" ? caption : "",
        url: str(item.url) ?? str(item.webPostUrl) ?? null,
        timestamp:
          str(item.timestamp) ??
          (typeof item.takenAt === "number"
            ? new Date(item.takenAt * 1000).toISOString()
            : null),
      });
    }
  }

  return { ok: true, followers, posts, raw: items.slice(0, 3) };
}

function parseTikTokItems(items: unknown[]): SocialProfileFetch {
  const posts: SocialProfileFetch["posts"] = [];
  let followers: number | null = null;
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const author = item.authorMeta as Record<string, unknown> | undefined;
    if (followers == null) {
      followers =
        num(author?.fans) ?? num(item.followerCount) ?? num(item.fans) ?? null;
    }
    const caption = str(item.text) ?? str(item.desc) ?? "";
    posts.push({
      id: str(item.id) ?? `tt-${posts.length}`,
      caption,
      url: str(item.webVideoUrl) ?? str(item.url) ?? null,
      timestamp: str(item.createTimeISO) ?? null,
    });
  }
  return { ok: true, followers, posts, raw: items.slice(0, 2) };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
