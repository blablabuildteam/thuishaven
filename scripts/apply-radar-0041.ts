/**
 * Apply drizzle/0041_radar_enrich.sql against DATABASE_URL.
 * Usage: npx tsx --env-file=.env.local scripts/apply-radar-0041.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ontbreekt");
  const sqlPath = resolve("drizzle/0041_radar_enrich.sql");
  const body = readFileSync(sqlPath, "utf8");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe(body);
    console.log("Applied 0041_radar_enrich.sql");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
