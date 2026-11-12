/**
 * NL-audience proxy: share of recent gigs in NL + resident country + RA regions.
 * Not YouTube geo (unavailable for others' videos) — booking geography.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { radarArtists, radarGigs } from "@/lib/radar/schema";

export type NlAudienceResult = {
  updated: number;
  errors: string[];
};

function isNlCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return /^(nl|netherlands|nederland)$/i.test(country.trim());
}

function isNlRegion(name: string | null | undefined): boolean {
  if (!name) return false;
  return /nederland|netherlands|amsterdam|rotterdam|utrecht|eindhoven|den haag|the hague|groningen|tilburg/i.test(
    name,
  );
}

export function computeNlAudienceScore(input: {
  nlGigShare: number;
  residentCountry?: string | null;
  regionsMostPlayed?: Array<{ name: string; country?: string | null }>;
}): number {
  let score = input.nlGigShare * 70;
  if (isNlCountry(input.residentCountry)) score += 20;
  const regions = input.regionsMostPlayed ?? [];
  const nlRegions = regions.filter(
    (r) => isNlCountry(r.country) || isNlRegion(r.name),
  ).length;
  if (regions.length > 0) {
    score += Math.min(10, (nlRegions / regions.length) * 10);
  }
  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

export async function refreshNlAudienceScores(options?: {
  limit?: number;
}): Promise<NlAudienceResult> {
  const result: NlAudienceResult = { updated: 0, errors: [] };
  if (!hasDatabase()) {
    result.errors.push("DATABASE_URL ontbreekt");
    return result;
  }
  const db = getDb();
  const limit = Math.min(options?.limit ?? 800, 2000);
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const artists = await db
    .select({
      id: radarArtists.id,
      residentCountry: radarArtists.residentCountry,
      regionsMostPlayed: radarArtists.regionsMostPlayed,
    })
    .from(radarArtists)
    .where(
      sql`${radarArtists.status} not in ('passed', 'not_relevant')`,
    )
    .orderBy(desc(radarArtists.growthScore))
    .limit(limit);

  for (const artist of artists) {
    try {
      const gigs = await db
        .select({ country: radarGigs.country })
        .from(radarGigs)
        .where(
          sql`${radarGigs.artistId} = ${artist.id} and ${radarGigs.startsAt} >= ${since}`,
        );
      const total = gigs.length;
      const nl = gigs.filter((g) => isNlCountry(g.country)).length;
      const nlGigShare = total > 0 ? nl / total : 0;
      const regions =
        (artist.regionsMostPlayed as Array<{
          name: string;
          country?: string | null;
        }> | null) ?? [];
      const nlAudienceScore = computeNlAudienceScore({
        nlGigShare,
        residentCountry: artist.residentCountry,
        regionsMostPlayed: regions,
      });

      await db
        .update(radarArtists)
        .set({
          nlGigShare: String(Math.round(nlGigShare * 1000) / 1000),
          nlAudienceScore: String(nlAudienceScore),
          updatedAt: new Date(),
        })
        .where(eq(radarArtists.id, artist.id));
      result.updated += 1;
    } catch (e) {
      result.errors.push(
        `${artist.id}: ${e instanceof Error ? e.message : "nl score failed"}`,
      );
    }
  }

  return result;
}
