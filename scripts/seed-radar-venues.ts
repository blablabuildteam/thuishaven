/**
 * Idempotent seed van early-signal venues.
 * Usage: npx tsx --env-file=.env.local scripts/seed-radar-venues.ts
 */
import { endDb } from "../src/lib/db/client";
import { RADAR_SEED_VENUES } from "../src/lib/radar/seed-venues";
import { upsertSeedVenue } from "../src/lib/radar/venues";

async function main() {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const seed of RADAR_SEED_VENUES) {
    const res = await upsertSeedVenue({
      name: seed.name,
      raExternalId: seed.raId,
      raUrl: `https://ra.co/clubs/${seed.raId}`,
      city: seed.city,
      country: seed.country,
      kind: seed.kind,
      tier: seed.tier,
      curatorScore: seed.curatorScore,
      notes: seed.notes ?? null,
      status: "seed",
      discoveryHops: 0,
    });
    if ("error" in res) {
      errors.push(`${seed.name}: ${res.error}`);
      continue;
    }
    if (res.created) created += 1;
    else updated += 1;
  }

  console.log(
    JSON.stringify({ ok: errors.length === 0, created, updated, errors }, null, 2),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
