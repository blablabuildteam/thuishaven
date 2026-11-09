/**
 * Draait discovery over alle seed venues in batches (lokale volle data-run).
 * Usage: npx tsx --env-file=.env.local scripts/radar-batch-discovery.ts
 */
import { endDb } from "../src/lib/db/client";
import { discoverArtistsFromSeedVenues } from "../src/lib/radar/discovery";
import { nextVenueBatch } from "../src/lib/radar/rotation";
import { listActiveSeedVenues } from "../src/lib/radar/venues";

async function main() {
  const venues = await listActiveSeedVenues();
  const batchSize = 4;
  const rounds = Math.max(1, Math.ceil(venues.length / batchSize));
  console.log(`venues=${venues.length} rounds=${rounds} batchSize=${batchSize}`);

  const totals = {
    eventsSeen: 0,
    artistsCreated: 0,
    gigsUpserted: 0,
    venuesSuggested: 0,
    scored: 0,
    errors: 0,
  };

  for (let i = 0; i < rounds; i += 1) {
    const batch = await nextVenueBatch(batchSize);
    const t0 = Date.now();
    const result = await discoverArtistsFromSeedVenues({
      venueIds: batch.venueIds,
      historyYears: 2,
      limitPerVenue: 30,
      scoreLimit: 30,
      snowballArtists: 4,
    });
    totals.eventsSeen += result.eventsSeen;
    totals.artistsCreated += result.artistsCreated;
    totals.gigsUpserted += result.gigsUpserted;
    totals.venuesSuggested += result.venuesSuggested;
    totals.scored += result.scored;
    totals.errors += result.errors.length;
    console.log(
      JSON.stringify({
        round: i + 1,
        ms: Date.now() - t0,
        offset: batch.offset,
        venues: result.venuesScanned,
        events: result.eventsSeen,
        created: result.artistsCreated,
        gigs: result.gigsUpserted,
        scored: result.scored,
        errors: result.errors.length,
      }),
    );
  }

  console.log(JSON.stringify({ done: true, totals }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
