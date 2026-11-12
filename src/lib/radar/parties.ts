import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  radarArtists,
  radarParties,
  radarPartyLineup,
  radarVenueSourceConfigs,
  radarVenues,
  type WebsiteSelectors,
} from "@/lib/radar/schema";
import type { RadarPartySource, RadarPartyStatus } from "@/lib/radar/types";

export type RadarPartyRow = typeof radarParties.$inferSelect;
export type RadarPartyLineupRow = typeof radarPartyLineup.$inferSelect;
export type VenueSourceConfigRow = typeof radarVenueSourceConfigs.$inferSelect;

export type PartyListItem = {
  id: string;
  title: string;
  startsAt: Date | null;
  source: RadarPartySource;
  status: RadarPartyStatus;
  externalUrl: string | null;
  venueId: string | null;
  venueName: string | null;
  city: string | null;
  country: string | null;
  artistCount: number;
  newArtistCount: number;
  artists: Array<{
    id: string | null;
    name: string;
    growthScore: string | null;
    homeGigCount: number;
    isNew: boolean;
  }>;
};

export async function listRadarParties(options?: {
  upcomingOnly?: boolean;
  status?: RadarPartyStatus | "all";
  venueId?: string;
  limit?: number;
}): Promise<PartyListItem[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const limit = Math.min(options?.limit ?? 80, 200);
  const conditions = [];
  if (options?.upcomingOnly) {
    conditions.push(gte(radarParties.startsAt, sql`now() - interval '14 days'`));
  }
  if (options?.status && options.status !== "all") {
    conditions.push(eq(radarParties.status, options.status));
  }
  if (options?.venueId) {
    conditions.push(eq(radarParties.venueId, options.venueId));
  }

  const parties = await db
    .select({
      id: radarParties.id,
      title: radarParties.title,
      startsAt: radarParties.startsAt,
      source: radarParties.source,
      status: radarParties.status,
      externalUrl: radarParties.externalUrl,
      venueId: radarParties.venueId,
      venueName: radarVenues.name,
      city: radarParties.city,
      country: radarParties.country,
    })
    .from(radarParties)
    .leftJoin(radarVenues, eq(radarParties.venueId, radarVenues.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(radarParties.startsAt), asc(radarParties.title))
    .limit(limit);

  if (parties.length === 0) return [];

  const ids = parties.map((p) => p.id);
  const lineup = await db
    .select({
      partyId: radarPartyLineup.partyId,
      rawName: radarPartyLineup.rawName,
      artistId: radarPartyLineup.artistId,
      billingIndex: radarPartyLineup.billingIndex,
      name: radarArtists.name,
      growthScore: radarArtists.growthScore,
      homeGigCount: radarArtists.homeGigCount,
      firstSeenAt: radarArtists.firstSeenAt,
      createdAt: radarArtists.createdAt,
    })
    .from(radarPartyLineup)
    .leftJoin(radarArtists, eq(radarPartyLineup.artistId, radarArtists.id))
    .where(inArray(radarPartyLineup.partyId, ids))
    .orderBy(asc(radarPartyLineup.billingIndex));

  const byParty = new Map<string, typeof lineup>();
  for (const row of lineup) {
    const list = byParty.get(row.partyId) ?? [];
    list.push(row);
    byParty.set(row.partyId, list);
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return parties.map((p) => {
    const slots = byParty.get(p.id) ?? [];
    const artists = slots.map((s) => {
      const seen = s.firstSeenAt ?? s.createdAt;
      const isNew = Boolean(seen && seen.getTime() >= weekAgo);
      return {
        id: s.artistId,
        name: s.name ?? s.rawName,
        growthScore: s.growthScore,
        homeGigCount: s.homeGigCount ?? 0,
        isNew,
      };
    });
    return {
      id: p.id,
      title: p.title,
      startsAt: p.startsAt,
      source: p.source,
      status: p.status,
      externalUrl: p.externalUrl,
      venueId: p.venueId,
      venueName: p.venueName,
      city: p.city,
      country: p.country,
      artistCount: artists.length,
      newArtistCount: artists.filter((a) => a.isNew).length,
      artists,
    };
  });
}

export async function getVenueSourceConfig(
  venueId: string,
): Promise<VenueSourceConfigRow | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(radarVenueSourceConfigs)
    .where(eq(radarVenueSourceConfigs.venueId, venueId))
    .limit(1);
  return row ?? null;
}

export async function upsertVenueSourceConfig(input: {
  venueId: string;
  websiteProgramUrl?: string | null;
  instagramHandle?: string | null;
  websiteSelectors?: WebsiteSelectors | null;
  enabled?: boolean;
}): Promise<
  { ok: true; config: VenueSourceConfigRow } | { error: string }
> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const handle = input.instagramHandle
    ?.replace(/^@/, "")
    .trim() || null;
  const [row] = await db
    .insert(radarVenueSourceConfigs)
    .values({
      venueId: input.venueId,
      websiteProgramUrl: input.websiteProgramUrl ?? null,
      instagramHandle: handle,
      websiteSelectors: input.websiteSelectors ?? {},
      enabled: input.enabled ?? true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [radarVenueSourceConfigs.venueId],
      set: {
        websiteProgramUrl: input.websiteProgramUrl ?? null,
        instagramHandle: handle,
        websiteSelectors: input.websiteSelectors ?? {},
        enabled: input.enabled ?? true,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) return { error: "Config opslaan mislukt" };
  return { ok: true, config: row };
}

export async function listEnabledSourceConfigs(limit = 20): Promise<
  Array<VenueSourceConfigRow & { venueName: string }>
> {
  if (!hasDatabase()) return [];
  const db = getDb();
  return db
    .select({
      id: radarVenueSourceConfigs.id,
      venueId: radarVenueSourceConfigs.venueId,
      websiteProgramUrl: radarVenueSourceConfigs.websiteProgramUrl,
      instagramHandle: radarVenueSourceConfigs.instagramHandle,
      websiteSelectors: radarVenueSourceConfigs.websiteSelectors,
      lastWebsiteFetchAt: radarVenueSourceConfigs.lastWebsiteFetchAt,
      lastInstagramFetchAt: radarVenueSourceConfigs.lastInstagramFetchAt,
      lastError: radarVenueSourceConfigs.lastError,
      enabled: radarVenueSourceConfigs.enabled,
      createdAt: radarVenueSourceConfigs.createdAt,
      updatedAt: radarVenueSourceConfigs.updatedAt,
      venueName: radarVenues.name,
    })
    .from(radarVenueSourceConfigs)
    .innerJoin(
      radarVenues,
      eq(radarVenueSourceConfigs.venueId, radarVenues.id),
    )
    .where(
      and(
        eq(radarVenueSourceConfigs.enabled, true),
        sql`${radarVenues.status} in ('seed', 'accepted')`,
      ),
    )
    .orderBy(
      sql`coalesce(${radarVenueSourceConfigs.lastWebsiteFetchAt}, ${radarVenueSourceConfigs.lastInstagramFetchAt}) asc nulls first`,
    )
    .limit(limit);
}
