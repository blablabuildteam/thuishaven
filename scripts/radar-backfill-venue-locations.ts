/**
 * Backfill city/country on radar_venues via RA GraphQL.
 * Usage: npx tsx --env-file=.env.local scripts/radar-backfill-venue-locations.ts
 */
import { endDb } from "../src/lib/db/client";
import { backfillVenueLocations } from "../src/lib/radar/venues";

async function main() {
  const result = await backfillVenueLocations({ limit: 120 });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
