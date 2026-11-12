/**
 * Follow shortlisted / high-score artists on IG: detect gig announcements in captions.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  isApifyConfigured,
  runSocialProfileFetch,
} from "@/lib/integrations/apify/client";
import {
  insertMetricSnapshot,
  upsertArtistProfile,
} from "@/lib/radar/artists";
import { ingestPartyLineup } from "@/lib/radar/ingest-party";
import { parseLineupText } from "@/lib/radar/parse-lineup";
import { radarArtistProfiles, radarArtists } from "@/lib/radar/schema";

export type ArtistSocialFollowResult = {
  attempted: number;
  synced: number;
  gigsDetected: number;
  errors: string[];
  note?: string;
};

const GIG_HINT =
  /playing (at|@)|tonight|this (fri|sat|sunday)|tickets|on sale|support(ing)?|b2b|line[\s-]?up|see you (at|in)|live at/i;

export async function followArtistSocialGigs(options?: {
  limit?: number;
}): Promise<ArtistSocialFollowResult> {
  const result: ArtistSocialFollowResult = {
    attempted: 0,
    synced: 0,
    gigsDetected: 0,
    errors: [],
  };

  if (!isApifyConfigured()) {
    result.note = "Apify overgeslagen: APIFY_TOKEN ontbreekt.";
    return result;
  }
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }

  const limit = options?.limit ?? 20;
  const db = getDb();
  const artists = await db
    .select({
      id: radarArtists.id,
      name: radarArtists.name,
      handle: radarArtistProfiles.handle,
      url: radarArtistProfiles.url,
    })
    .from(radarArtists)
    .innerJoin(
      radarArtistProfiles,
      and(
        eq(radarArtistProfiles.artistId, radarArtists.id),
        eq(radarArtistProfiles.platform, "instagram"),
      ),
    )
    .where(
      sql`${radarArtists.status} in ('new', 'watching', 'shortlist', 'contacted')
        and ${radarArtistProfiles.handle} is not null`,
    )
    .orderBy(
      sql`case when ${radarArtists.status} = 'shortlist' then 0
               when ${radarArtists.status} = 'watching' then 1
               else 2 end`,
      desc(radarArtists.growthScore),
    )
    .limit(limit);

  for (const artist of artists) {
    const handle = artist.handle?.replace(/^@/, "");
    if (!handle) continue;
    result.attempted += 1;
    const fetch = await runSocialProfileFetch({
      platform: "instagram",
      handle,
      resultsLimit: 8,
    });
    if (!fetch.ok) {
      result.errors.push(`${artist.name}: ${fetch.error}`);
      continue;
    }
    result.synced += 1;

    if (fetch.followers != null) {
      await insertMetricSnapshot({
        artistId: artist.id,
        platform: "instagram",
        metrics: { followers: fetch.followers },
      });
      await upsertArtistProfile({
        artistId: artist.id,
        platform: "instagram",
        handle,
        url: artist.url ?? `https://www.instagram.com/${handle}/`,
        matchConfidence: "high",
        raw: { lastFollowers: fetch.followers },
      });
    }

    for (const post of fetch.posts) {
      const caption = post.caption?.trim();
      if (!caption || !GIG_HINT.test(caption)) continue;
      const venueGuess = guessVenueFromCaption(caption);
      const title =
        firstLine(caption).slice(0, 140) || `${artist.name} IG gig`;
      const others = parseLineupText(
        caption.replace(/https?:\/\/\S+/g, " ").replace(/#[\w.]+/g, " "),
      ).filter((n) => n.toLowerCase() !== artist.name.toLowerCase());
      const names = [artist.name, ...others].slice(0, 12);
      const ingested = await ingestPartyLineup({
        venueId: null,
        title: venueGuess ? `${venueGuess} · ${title}` : title,
        startsAt: post.timestamp ? new Date(post.timestamp) : null,
        source: "instagram",
        externalUrl: post.url,
        externalId: `ig-artist:${artist.id}:${post.id}`,
        lineupNames: names,
        needsReview: true,
        alertOnCreate: false,
        raw: {
          caption: caption.slice(0, 2000),
          artistId: artist.id,
          kind: "artist_social_gig",
        },
      });
      if ("ok" in ingested && ingested.ok) {
        result.gigsDetected += 1;
      }
    }
  }

  return result;
}

function guessVenueFromCaption(caption: string): string | null {
  const at = caption.match(
    /(?:at|@)\s+([A-Z][\w&'’.\-\s]{2,40})(?:\s*[·|,.\n]|$)/,
  );
  return at?.[1]?.trim() || null;
}

function firstLine(s: string): string {
  return s.split("\n").map((l) => l.trim()).find(Boolean) ?? s;
}
