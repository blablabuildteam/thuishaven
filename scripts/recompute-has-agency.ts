/**
 * One-shot: recompute radar_artists.has_agency with the stricter parser.
 */
import postgres from "postgres";
import { detectHasAgency } from "../src/lib/radar/booking-parse";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ontbreekt");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const rows = (await sql`
      select id, booking_details, has_agency
      from radar_artists
      where nullif(trim(booking_details), '') is not null
    `) as unknown as Array<{
      id: string;
      booking_details: string | null;
      has_agency: boolean;
    }>;

    let flippedOn = 0;
    let flippedOff = 0;
    for (const row of rows) {
      const next = detectHasAgency(row.booking_details);
      if (next === row.has_agency) continue;
      await sql`update radar_artists set has_agency = ${next}, updated_at = now() where id = ${row.id}::uuid`;
      if (next) flippedOn += 1;
      else flippedOff += 1;
    }
    console.log(
      `Recomputed ${rows.length} booking rows · agency→true ${flippedOn} · agency→false ${flippedOff}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
