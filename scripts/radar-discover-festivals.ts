/**
 * One-shot: pull RA promoter line-ups for all seed/accepted festivals → radar_parties.
 * Usage: npx tsx --env-file=.env.local scripts/radar-discover-festivals.ts
 */
import { endDb } from "../src/lib/db/client";
import { discoverArtistsFromSeedVenues } from "../src/lib/radar/discovery";
import { listActiveSeedVenues } from "../src/lib/radar/venues";

async function main() {
  const festivals = (await listActiveSeedVenues()).filter(
    (v) => v.kind === "festival",
  );
  console.log(`festivals=${festivals.length}`);
  if (festivals.length === 0) return;

  const batchSize = 3;
  const totals = {
    eventsSeen: 0,
    artistsCreated: 0,
    gigsUpserted: 0,
    partiesHint: 0,
    errors: [] as string[],
  };

  for (let i = 0; i < festivals.length; i += batchSize) {
    const slice = festivals.slice(i, i + batchSize);
    const t0 = Date.now();
    const result = await discoverArtistsFromSeedVenues({
      venueIds: slice.map((v) => v.id),
      historyYears: 2,
      limitPerVenue: 40,
      scoreLimit: 40,
      snowballArtists: 0,
    });
    totals.eventsSeen += result.eventsSeen;
    totals.artistsCreated += result.artistsCreated;
    totals.gigsUpserted += result.gigsUpserted;
    totals.errors.push(...result.errors.slice(0, 3));
    console.log(
      JSON.stringify({
        batch: slice.map((v) => v.name),
        ms: Date.now() - t0,
        events: result.eventsSeen,
        created: result.artistsCreated,
        gigs: result.gigsUpserted,
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
