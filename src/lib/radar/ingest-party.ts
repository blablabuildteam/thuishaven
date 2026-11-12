/**
 * Shared party + lineup ingest for manual / website / Instagram / RA bridges.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { createRadarAlert } from "@/lib/radar/alerts";
import { upsertRadarArtist } from "@/lib/radar/artists";
import { upsertRadarGig } from "@/lib/radar/gigs";
import { parseLineupText } from "@/lib/radar/parse-lineup";
import {
  radarArtists,
  radarParties,
  radarPartyLineup,
  radarVenues,
} from "@/lib/radar/schema";
import { normalizeArtistName, type RadarPartySource } from "@/lib/radar/types";

export type IngestPartyInput = {
  venueId?: string | null;
  title: string;
  startsAt?: Date | null;
  source: RadarPartySource;
  externalUrl?: string | null;
  externalId?: string | null;
  city?: string | null;
  country?: string | null;
  /** Raw lineup text OR pre-split names. */
  lineupText?: string | null;
  lineupNames?: string[];
  /** Force needs_review (e.g. low-confidence IG parse). */
  needsReview?: boolean;
  raw?: Record<string, unknown> | null;
  /** Create new_on_radar alerts for brand-new artists. */
  alertOnCreate?: boolean;
};

export type IngestPartyResult = {
  ok: true;
  partyId: string;
  created: boolean;
  artistsCreated: number;
  artistsMatched: number;
  lineupSlots: number;
  status: "published" | "needs_review" | "rejected";
};

export async function ingestPartyLineup(
  input: IngestPartyInput,
): Promise<IngestPartyResult | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const title = input.title.trim();
  if (!title) return { error: "Titel is verplicht" };

  const names =
    input.lineupNames?.map((n) => n.trim()).filter(Boolean) ??
    parseLineupText(input.lineupText ?? "");
  if (names.length === 0) return { error: "Geen artiestnamen in de line-up" };

  const db = getDb();
  let venueCity = input.city ?? null;
  let venueCountry = input.country ?? null;
  if (input.venueId) {
    const [venue] = await db
      .select()
      .from(radarVenues)
      .where(eq(radarVenues.id, input.venueId))
      .limit(1);
    if (!venue) return { error: "Venue niet gevonden" };
    venueCity = venueCity ?? venue.city;
    venueCountry = venueCountry ?? venue.country;
  }

  const status = input.needsReview ? "needs_review" : "published";
  const externalId =
    input.externalId?.trim() ||
    (input.source === "manual"
      ? `manual:${input.venueId ?? "x"}:${slugPart(title)}:${input.startsAt?.toISOString().slice(0, 10) ?? "nodate"}`
      : null);

  let partyId: string;
  let created = false;

  if (externalId) {
    const [existing] = await db
      .select()
      .from(radarParties)
      .where(
        and(
          eq(radarParties.source, input.source),
          eq(radarParties.externalId, externalId),
        ),
      )
      .limit(1);
    if (existing) {
      partyId = existing.id;
      await db
        .update(radarParties)
        .set({
          title,
          startsAt: input.startsAt ?? existing.startsAt,
          venueId: input.venueId ?? existing.venueId,
          externalUrl: input.externalUrl ?? existing.externalUrl,
          city: venueCity,
          country: venueCountry,
          status: input.needsReview ? "needs_review" : existing.status,
          raw: input.raw ?? existing.raw,
          updatedAt: new Date(),
        })
        .where(eq(radarParties.id, existing.id));
    } else {
      const [party] = await db
        .insert(radarParties)
        .values({
          venueId: input.venueId ?? null,
          title,
          startsAt: input.startsAt ?? null,
          source: input.source,
          status,
          externalUrl: input.externalUrl ?? null,
          externalId,
          city: venueCity,
          country: venueCountry,
          raw: input.raw ?? null,
          updatedAt: new Date(),
        })
        .returning();
      if (!party) return { error: "Party opslaan mislukt" };
      partyId = party.id;
      created = true;
    }
  } else {
    const [party] = await db
      .insert(radarParties)
      .values({
        venueId: input.venueId ?? null,
        title,
        startsAt: input.startsAt ?? null,
        source: input.source,
        status,
        externalUrl: input.externalUrl ?? null,
        externalId: null,
        city: venueCity,
        country: venueCountry,
        raw: input.raw ?? null,
        updatedAt: new Date(),
      })
      .returning();
    if (!party) return { error: "Party opslaan mislukt" };
    partyId = party.id;
    created = true;
  }

  let artistsCreated = 0;
  let artistsMatched = 0;
  let lineupSlots = 0;

  for (let i = 0; i < names.length; i++) {
    const rawName = names[i]!;
    const artistRes = await upsertRadarArtist({
      name: rawName,
      discoverySource: "lineup",
      discoveryHops: 0,
      discoveredViaVenueId: input.venueId ?? null,
      city: venueCity,
      country: venueCountry,
    });
    if ("error" in artistRes) continue;

    const artist = artistRes.artist;
    if (artistRes.created) {
      artistsCreated += 1;
      if (input.alertOnCreate !== false) {
        await createRadarAlert({
          kind: "new_on_radar",
          artistId: artist.id,
          venueId: input.venueId ?? null,
          title: `Nieuw via ${input.source}: ${artist.name}`,
          body: `Gespot op “${title}”`,
          payload: { partyId, source: input.source },
        });
      }
    } else {
      artistsMatched += 1;
    }

    const confidence =
      input.needsReview && !artistRes.created ? "low" : "high";

    await db
      .insert(radarPartyLineup)
      .values({
        partyId,
        artistId: artist.id,
        rawName,
        billingIndex: i,
        source: input.source,
        matchConfidence: confidence,
      })
      .onConflictDoUpdate({
        target: [radarPartyLineup.partyId, radarPartyLineup.rawName],
        set: {
          artistId: artist.id,
          billingIndex: i,
          matchConfidence: confidence,
        },
      });
    lineupSlots += 1;

    const eventKey =
      externalId ??
      `party:${partyId}`;
    await upsertRadarGig({
      artistId: artist.id,
      venueId: input.venueId ?? null,
      eventName: title,
      startsAt: input.startsAt ?? null,
      city: venueCity,
      country: venueCountry,
      source: sourceToGigSource(input.source),
      sourceUrl: input.externalUrl ?? null,
      externalEventId: `${eventKey}:${normalizeArtistName(rawName) || i}`,
      billingIndex: i,
      isHeadliner: i === 0,
    });
  }

  return {
    ok: true,
    partyId,
    created,
    artistsCreated,
    artistsMatched,
    lineupSlots,
    status,
  };
}

function sourceToGigSource(source: RadarPartySource): string {
  switch (source) {
    case "ra":
      return "resident_advisor";
    case "website":
      return "website";
    case "instagram":
      return "instagram";
    default:
      return "manual";
  }
}

function slugPart(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "party";
}

/**
 * Link an already-processed RA event to radar_parties without re-creating artists.
 */
export async function upsertRaPartyWithLineup(input: {
  venueId: string;
  title: string;
  startsAt: Date | null;
  externalEventId: string;
  externalUrl?: string | null;
  city?: string | null;
  country?: string | null;
  lineup: Array<{ artistId: string; rawName: string; billingIndex: number }>;
}): Promise<void> {
  if (!hasDatabase() || !input.externalEventId) return;
  const db = getDb();
  const externalId = `ra:${input.externalEventId}`;
  const [existing] = await db
    .select({ id: radarParties.id })
    .from(radarParties)
    .where(
      and(
        eq(radarParties.source, "ra"),
        eq(radarParties.externalId, externalId),
      ),
    )
    .limit(1);

  let partyId = existing?.id;
  if (!partyId) {
    const [party] = await db
      .insert(radarParties)
      .values({
        venueId: input.venueId,
        title: input.title,
        startsAt: input.startsAt,
        source: "ra",
        status: "published",
        externalUrl: input.externalUrl ?? null,
        externalId,
        city: input.city ?? null,
        country: input.country ?? null,
        updatedAt: new Date(),
      })
      .returning({ id: radarParties.id });
    partyId = party?.id;
  } else {
    await db
      .update(radarParties)
      .set({
        title: input.title,
        startsAt: input.startsAt,
        venueId: input.venueId,
        externalUrl: input.externalUrl ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        updatedAt: new Date(),
      })
      .where(eq(radarParties.id, partyId));
  }
  if (!partyId) return;

  for (const slot of input.lineup) {
    await db
      .insert(radarPartyLineup)
      .values({
        partyId,
        artistId: slot.artistId,
        rawName: slot.rawName,
        billingIndex: slot.billingIndex,
        source: "ra",
        matchConfidence: "high",
      })
      .onConflictDoUpdate({
        target: [radarPartyLineup.partyId, radarPartyLineup.rawName],
        set: {
          artistId: slot.artistId,
          billingIndex: slot.billingIndex,
          matchConfidence: "high",
        },
      });
  }
}

/** Resolve unmatched raw names that later get an exact artist match. */
export async function linkLineupSlotToArtist(
  slotId: string,
  artistId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [artist] = await db
    .select({ id: radarArtists.id })
    .from(radarArtists)
    .where(eq(radarArtists.id, artistId))
    .limit(1);
  if (!artist) return { error: "Artiest niet gevonden" };
  const [slot] = await db
    .update(radarPartyLineup)
    .set({ artistId, matchConfidence: "high" })
    .where(eq(radarPartyLineup.id, slotId))
    .returning();
  if (!slot) return { error: "Slot niet gevonden" };
  return { ok: true };
}

export async function setPartyStatus(
  partyId: string,
  status: "published" | "needs_review" | "rejected",
): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [row] = await db
    .update(radarParties)
    .set({ status, updatedAt: new Date() })
    .where(eq(radarParties.id, partyId))
    .returning({ id: radarParties.id });
  if (!row) return { error: "Party niet gevonden" };
  return { ok: true };
}

/** Count helpers for admin / pipeline notes. */
export async function countPartiesNeedingReview(): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(radarParties)
    .where(eq(radarParties.status, "needs_review"));
  return Number(row?.n) || 0;
}
