/**
 * Import bestaande dashboard ra_listings (Thuishaven) naar radar_artists + radar_gigs.
 * Sneller dan opnieuw RA scrapen — data staat al in Neon.
 *
 * Usage: npx tsx --env-file=.env.local scripts/import-thuishaven-ra-listings.ts
 */
import { eq } from "drizzle-orm";
import { endDb, getDb } from "../src/lib/db/client";
import { raListings } from "../src/lib/db/schema";
import { upsertRadarArtist, upsertArtistProfile } from "../src/lib/radar/artists";
import { upsertRadarGig } from "../src/lib/radar/gigs";
import { recomputeArtistScoreV2 } from "../src/lib/radar/score-v2";
import { radarVenues } from "../src/lib/radar/schema";

async function main() {
  const db = getDb();
  const [venue] = await db
    .select()
    .from(radarVenues)
    .where(eq(radarVenues.raExternalId, "109027"))
    .limit(1);
  if (!venue) {
    throw new Error("Thuishaven seed venue ontbreekt — run seed:radar-venues eerst");
  }

  const listings = await db.select().from(raListings);
  let artistsCreated = 0;
  let gigsUpserted = 0;
  let errors = 0;
  const touched = new Set<string>();

  for (const listing of listings) {
    const names = (listing.artists ?? []).filter(Boolean);
    for (let i = 0; i < names.length; i += 1) {
      const name = String(names[i]).trim();
      if (!name) continue;
      const up = await upsertRadarArtist({
        name,
        discoverySource: "lineup",
        discoveryHops: 0,
        discoveredViaVenueId: venue.id,
        city: "Amsterdam",
        country: "NL",
      });
      if ("error" in up) {
        errors += 1;
        continue;
      }
      if (up.created) artistsCreated += 1;
      touched.add(up.artist.id);

      const gig = await upsertRadarGig({
        artistId: up.artist.id,
        venueId: venue.id,
        eventName: listing.title,
        startsAt: listing.startsAt,
        city: "Amsterdam",
        country: "NL",
        sourceUrl: listing.contentUrl
          ? listing.contentUrl.startsWith("http")
            ? listing.contentUrl
            : `https://ra.co${listing.contentUrl}`
          : null,
        externalEventId: `${listing.raEventId}:${up.artist.id}`,
        billingIndex: i,
        isHeadliner: i === 0,
        attending: listing.attending,
      });
      if ("error" in gig) errors += 1;
      else gigsUpserted += 1;
    }
  }

  // Score a useful slice so the UI has ranks immediately
  let scored = 0;
  for (const artistId of touched) {
    if (scored >= 80) break;
    const score = await recomputeArtistScoreV2(artistId);
    if (score) scored += 1;
  }

  // Keep RA profile placeholder empty — names-only import
  void upsertArtistProfile;

  console.log(
    JSON.stringify(
      {
        ok: errors === 0,
        listings: listings.length,
        artistsTouched: touched.size,
        artistsCreated,
        gigsUpserted,
        scored,
        errors,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
