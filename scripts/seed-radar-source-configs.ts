/**
 * Seed website/IG source configs for known startlijst venues (by name match).
 */
import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  radarVenueSourceConfigs,
  radarVenues,
} from "@/lib/radar/schema";

const SEEDS: Array<{
  name: string;
  websiteProgramUrl?: string;
  instagramHandle?: string;
}> = [
  {
    name: "Garage Noord",
    websiteProgramUrl: "https://www.garagenoord.com/",
    instagramHandle: "garagenoord",
  },
  {
    name: "Shelter Amsterdam",
    websiteProgramUrl: "https://shelteramsterdam.com/",
    instagramHandle: "shelteramsterdam",
  },
  {
    name: "RADION",
    websiteProgramUrl: "https://radion.amsterdam/",
    instagramHandle: "radionamsterdam",
  },
  {
    name: "Thuishaven",
    websiteProgramUrl: "https://thuishaven.com/",
    instagramHandle: "thuishaven",
  },
  {
    name: "De School",
    websiteProgramUrl: "https://www.deschoolamsterdam.nl/",
    instagramHandle: "deschoolamsterdam",
  },
  {
    name: "OT301",
    websiteProgramUrl: "https://www.ot301.nl/",
    instagramHandle: "ot301",
  },
  {
    name: "Lofi",
    instagramHandle: "lofiamsterdam",
  },
  {
    name: "CLUB RAUM",
    instagramHandle: "clubraum",
  },
  {
    name: "Draaimolen Festival",
    websiteProgramUrl: "https://draaimolen.eu/",
    instagramHandle: "draaimolenfestival",
  },
  {
    name: "Awakenings",
    websiteProgramUrl: "https://awakenings.com/",
    instagramHandle: "awakenings",
  },
];

async function main() {
  if (!hasDatabase()) throw new Error("DATABASE_URL ontbreekt");
  const db = getDb();
  let upserted = 0;
  for (const seed of SEEDS) {
    const [venue] = await db
      .select({ id: radarVenues.id, name: radarVenues.name })
      .from(radarVenues)
      .where(sql`lower(${radarVenues.name}) = ${seed.name.toLowerCase()}`)
      .limit(1);
    if (!venue) {
      console.log(`skip (geen venue): ${seed.name}`);
      continue;
    }
    await db
      .insert(radarVenueSourceConfigs)
      .values({
        venueId: venue.id,
        websiteProgramUrl: seed.websiteProgramUrl ?? null,
        instagramHandle: seed.instagramHandle ?? null,
        enabled: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [radarVenueSourceConfigs.venueId],
        set: {
          websiteProgramUrl: seed.websiteProgramUrl ?? null,
          instagramHandle: seed.instagramHandle ?? null,
          enabled: true,
          updatedAt: new Date(),
        },
      });
    upserted += 1;
    console.log(`ok: ${venue.name}`);
  }
  console.log(`Seeded ${upserted} source configs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
