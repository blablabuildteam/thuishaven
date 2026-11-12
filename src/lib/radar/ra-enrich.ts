/**
 * Enrich radar artists from RA artist(id) — socials, followers, agency, related.
 */
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getRaArtistProfile } from "@/lib/integrations/ra/client";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  insertMetricSnapshot,
  upsertArtistProfile,
  upsertRadarArtist,
} from "@/lib/radar/artists";
import { withRetry } from "@/lib/radar/retry";
import {
  radarArtistProfiles,
  radarArtists,
  radarGigs,
} from "@/lib/radar/schema";

const AGENCY_RE = /agency|booking|management|@|mailto:/i;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function handleFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1]?.replace(/^@/, "").trim();
    return last || null;
  } catch {
    return null;
  }
}

function absoluteUrl(url: string | null): string | null {
  if (!url?.trim()) return null;
  if (url.startsWith("http")) return url.trim();
  if (url.startsWith("/")) return `https://ra.co${url}`;
  return `https://${url.trim()}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type RaEnrichResult = {
  attempted: number;
  enriched: number;
  profilesWritten: number;
  relatedCreated: number;
  errors: string[];
};

export async function enrichArtistsFromRa(options?: {
  limit?: number;
}): Promise<RaEnrichResult> {
  const result: RaEnrichResult = {
    attempted: 0,
    enriched: 0,
    profilesWritten: 0,
    relatedCreated: 0,
    errors: [],
  };
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }

  const db = getDb();
  const limit = Math.min(Math.max(options?.limit ?? 150, 1), 400);
  const staleBefore = new Date(Date.now() - STALE_MS);

  const candidates = await db
    .select({
      artistId: radarArtists.id,
      raId: radarArtistProfiles.externalId,
      gigCount: sql<number>`coalesce(count(${radarGigs.id}), 0)::int`,
    })
    .from(radarArtistProfiles)
    .innerJoin(
      radarArtists,
      eq(radarArtists.id, radarArtistProfiles.artistId),
    )
    .leftJoin(radarGigs, eq(radarGigs.artistId, radarArtists.id))
    .where(
      and(
        eq(radarArtistProfiles.platform, "resident_advisor"),
        sql`${radarArtistProfiles.externalId} is not null`,
        or(
          isNull(radarArtists.raEnrichedAt),
          lt(radarArtists.raEnrichedAt, staleBefore),
        ),
      ),
    )
    .groupBy(radarArtists.id, radarArtistProfiles.externalId)
    .orderBy(desc(sql`count(${radarGigs.id})`), asc(radarArtists.name))
    .limit(limit);

  for (const row of candidates) {
    const raId = row.raId?.trim();
    if (!raId) continue;
    result.attempted += 1;

    try {
      const profile = await withRetry(() => getRaArtistProfile(raId), {
        tries: 3,
        backoffMs: 400,
      });
      if (!profile.ok) {
        result.errors.push(`${raId}: ${profile.error}`);
        await sleep(80);
        continue;
      }
      const a = profile.artist;
      const booking = a.bookingDetails?.trim() || null;
      const hasAgency = Boolean(booking && AGENCY_RE.test(booking));
      const country = a.residentCountry || a.countryName || null;
      const firstEventAt = a.firstEventDate
        ? new Date(a.firstEventDate)
        : null;

      const regions = (a.regionsMostPlayed ?? []).slice(0, 12);

      await withRetry(async () => {
        await db
          .update(radarArtists)
          .set({
            raFollowerCount: a.followerCount,
            residentCountry: country,
            bookingDetails: booking,
            hasAgency,
            firstEventAt:
              firstEventAt && !Number.isNaN(firstEventAt.getTime())
                ? firstEventAt
                : null,
            country: country ?? undefined,
            city: a.areaName ?? undefined,
            regionsMostPlayed: regions,
            raEnrichedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(radarArtists.id, row.artistId));
      });

      // Keep RA profile raw + socials
      await upsertArtistProfile({
        artistId: row.artistId,
        platform: "resident_advisor",
        externalId: a.id,
        url: absoluteUrl(a.contentUrl),
        handle: a.name,
        matchConfidence: "high",
        raw: {
          followerCount: a.followerCount,
          bookingDetails: booking,
          website: a.website,
          facebook: a.facebook,
          twitter: a.twitter,
          bandcamp: a.bandcamp,
          discogs: a.discogs,
          podcasts: a.podcasts.slice(0, 10),
          labels: a.labels.slice(0, 10),
          regionsMostPlayed: regions,
          upcomingEventsCount: a.upcomingEventsCount,
        },
      });
      result.profilesWritten += 1;

      if (a.instagram) {
        await upsertArtistProfile({
          artistId: row.artistId,
          platform: "instagram",
          url: absoluteUrl(a.instagram),
          handle: handleFromUrl(a.instagram),
          matchConfidence: "high",
          raw: { source: "ra" },
        });
        result.profilesWritten += 1;
      }
      if (a.soundcloud) {
        await upsertArtistProfile({
          artistId: row.artistId,
          platform: "soundcloud",
          url: absoluteUrl(a.soundcloud),
          handle: handleFromUrl(a.soundcloud),
          matchConfidence: "high",
          raw: { source: "ra" },
        });
        result.profilesWritten += 1;
      }

      if (a.followerCount != null) {
        await insertMetricSnapshot({
          artistId: row.artistId,
          platform: "resident_advisor",
          metrics: {
            followers: a.followerCount,
            upcomingEvents: a.upcomingEventsCount,
            podcasts: a.podcasts.length,
          },
        });
      }

      for (const related of a.relatedArtists.slice(0, 5)) {
        const up = await upsertRadarArtist({
          name: related.name,
          discoverySource: "snowball",
          discoveryHops: 1,
        });
        if ("ok" in up && up.ok) {
          if (up.created) result.relatedCreated += 1;
          await upsertArtistProfile({
            artistId: up.artist.id,
            platform: "resident_advisor",
            externalId: related.id,
            url: absoluteUrl(related.contentUrl),
            handle: related.name,
            matchConfidence: "high",
          });
        }
      }

      result.enriched += 1;
    } catch (e) {
      result.errors.push(
        `${raId}: ${e instanceof Error ? e.message : "enrich failed"}`,
      );
    }

    await sleep(80);
  }

  return result;
}
