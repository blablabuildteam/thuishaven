import { count, eq, min } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { marketingPosts } from "@/lib/db/schema";
import { socialSyncSince } from "@/lib/integrations/social/sync-window";
import type { SocialFeedChannel } from "@/lib/marketing/post-types";

/** Legacy sync caps — treat these as "never finished a deep backfill". */
const LEGACY_SYNC_CAPS = new Set([24, 25, 40, 100]);

/** True when we lack ~6 months of history or are stuck on an old sync cap. */
export async function needsSocialHistoryBackfill(
  channel: SocialFeedChannel,
): Promise<boolean> {
  if (!hasDatabase()) return false;
  const since = socialSyncSince();
  // Allow a 2-week grace so quiet accounts don't loop forever.
  const threshold = new Date(since.getTime() + 14 * 24 * 60 * 60 * 1000);
  const db = getDb();
  const [row] = await db
    .select({
      n: count(),
      oldest: min(marketingPosts.publishedAt),
    })
    .from(marketingPosts)
    .where(eq(marketingPosts.channel, channel));

  const n = Number(row?.n ?? 0);
  if (n === 0) return true;
  // Still on a pre-lookback sync size.
  if (LEGACY_SYNC_CAPS.has(n)) return true;
  // Already deep-synced a substantial archive — don't loop if the account
  // simply didn't post for the full 6 months.
  if (n >= 100) return false;
  if (!row?.oldest) return true;
  return row.oldest.getTime() > threshold.getTime();
}
