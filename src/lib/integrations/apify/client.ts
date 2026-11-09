/**
 * Apify scaffold for Instagram / TikTok public metrics.
 * Actors + proxy costs live on Thuishaven's Apify account.
 *
 * Expected env:
 * - APIFY_TOKEN
 * - APIFY_INSTAGRAM_ACTOR_ID (optional override)
 * - APIFY_TIKTOK_ACTOR_ID (optional override)
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

/** Placeholder — wire concrete actors once Thuishaven picks Instagram/TikTok actors. */
export async function runSocialProfileFetch(_input: {
  platform: "instagram" | "tiktok";
  handle: string;
}): Promise<{ ok: false; error: string }> {
  if (!isApifyConfigured()) {
    return { ok: false, error: "APIFY_TOKEN ontbreekt" };
  }
  return {
    ok: false,
    error:
      "Apify social fetch nog niet gekoppeld — kies actor-ids in Radar-instellingen.",
  };
}
