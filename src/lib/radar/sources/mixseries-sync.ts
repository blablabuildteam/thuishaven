/**
 * Pull recent uploads from mixseries YouTube channels, match titles to Radar
 * artists, snapshot views, alert when a set “flies”.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  listChannelVideosById,
  youtubeApiKey,
} from "@/lib/integrations/youtube/client";
import { createRadarAlert } from "@/lib/radar/alerts";
import { insertMetricSnapshot } from "@/lib/radar/artists";
import { RADAR_MIXSERIES_CHANNELS } from "@/lib/radar/mixseries-channels";
import {
  radarArtists,
  radarMixseriesAppearances,
} from "@/lib/radar/schema";
import { normalizeArtistName } from "@/lib/radar/types";

export type MixseriesSyncResult = {
  channelsTried: number;
  videosSeen: number;
  matched: number;
  viralAlerts: number;
  errors: string[];
  note?: string;
};

export async function syncMixseriesChannels(options?: {
  videosPerChannel?: number;
}): Promise<MixseriesSyncResult> {
  const result: MixseriesSyncResult = {
    channelsTried: 0,
    videosSeen: 0,
    matched: 0,
    viralAlerts: 0,
    errors: [],
  };

  if (!youtubeApiKey()) {
    result.note = "YouTube overgeslagen: YOUTUBE_API_KEY ontbreekt.";
    return result;
  }
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }

  const db = getDb();
  const perChannel = Math.min(options?.videosPerChannel ?? 12, 25);

  // Load candidate artist names (active radar + shortlist-heavy)
  const artists = await db
    .select({
      id: radarArtists.id,
      name: radarArtists.name,
      normalizedName: radarArtists.normalizedName,
      status: radarArtists.status,
    })
    .from(radarArtists)
    .where(
      sql`${radarArtists.status} not in ('passed', 'not_relevant', 'booked')`,
    )
    .orderBy(desc(radarArtists.growthScore))
    .limit(2500);

  const byNorm = new Map(
    artists.map((a) => [a.normalizedName, a] as const),
  );
  // Also index longer names for contains-match (min 4 chars)
  const nameList = artists
    .filter((a) => a.normalizedName.length >= 4)
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length);

  for (const channel of RADAR_MIXSERIES_CHANNELS) {
    result.channelsTried += 1;
    const pull = await listChannelVideosById({
      channelId: channel.youtubeChannelId,
      limit: perChannel,
    });
    if (!pull.ok) {
      result.errors.push(`${channel.title}: ${pull.error}`);
      continue;
    }

    for (const video of pull.videos) {
      result.videosSeen += 1;
      const match = matchArtistInTitle(video.title, byNorm, nameList);
      if (!match) continue;
      result.matched += 1;

      const [existing] = await db
        .select()
        .from(radarMixseriesAppearances)
        .where(
          and(
            eq(radarMixseriesAppearances.platform, "youtube"),
            eq(radarMixseriesAppearances.externalId, video.id),
          ),
        )
        .limit(1);

      const prevViews = existing?.viewCount ?? null;
      const url = `https://www.youtube.com/watch?v=${video.id}`;

      await db
        .insert(radarMixseriesAppearances)
        .values({
          artistId: match.id,
          channelKey: channel.key,
          channelTitle: channel.title,
          platform: "youtube",
          externalId: video.id,
          title: video.title,
          url,
          publishedAt: video.publishedAt
            ? new Date(video.publishedAt)
            : null,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          matchedName: match.name,
          raw: {
            commentCount: video.commentCount,
            durationSeconds: video.durationSeconds,
          },
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            radarMixseriesAppearances.platform,
            radarMixseriesAppearances.externalId,
          ],
          set: {
            artistId: match.id,
            viewCount: video.viewCount,
            likeCount: video.likeCount,
            title: video.title,
            matchedName: match.name,
            updatedAt: new Date(),
          },
        });

      await insertMetricSnapshot({
        artistId: match.id,
        platform: "youtube",
        metrics: {
          views: video.viewCount,
          likes: video.likeCount,
          videoId: video.id,
          channel: channel.key,
        },
      });

      const grew =
        prevViews != null &&
        prevViews > 0 &&
        video.viewCount / prevViews >= channel.viralGrowthRatio &&
        video.viewCount >= channel.viralViews * 0.4;
      const hotFirst =
        prevViews == null && video.viewCount >= channel.viralViews;

      if (grew || hotFirst) {
        await createRadarAlert({
          kind: "mixseries",
          artistId: match.id,
          title: `Mixseries vliegt: ${match.name} @ ${channel.title}`,
          body: `${video.viewCount.toLocaleString("nl-NL")} views · “${video.title.slice(0, 80)}”`,
          payload: {
            videoId: video.id,
            url,
            views: video.viewCount,
            prevViews,
            channel: channel.key,
          },
        });
        result.viralAlerts += 1;
      }
    }
  }

  return result;
}

function matchArtistInTitle(
  title: string,
  byNorm: Map<string, { id: string; name: string; normalizedName: string }>,
  nameList: Array<{ id: string; name: string; normalizedName: string }>,
): { id: string; name: string } | null {
  const normTitle = normalizeArtistName(title);
  // Exact-ish: "Artist Name |" / "Artist Name -" / "b2b"
  const head = title.split(/[|\-–—:]/)[0]?.trim() ?? title;
  const headNorm = normalizeArtistName(head);
  if (headNorm && byNorm.has(headNorm)) {
    const a = byNorm.get(headNorm)!;
    return { id: a.id, name: a.name };
  }
  // b2b pairs
  const b2b = head.split(/\bb2b\b/i).map((p) => normalizeArtistName(p));
  for (const part of b2b) {
    if (part && byNorm.has(part)) {
      const a = byNorm.get(part)!;
      return { id: a.id, name: a.name };
    }
  }
  // Longest contains match
  for (const a of nameList) {
    if (normTitle.includes(a.normalizedName)) {
      return { id: a.id, name: a.name };
    }
  }
  return null;
}
