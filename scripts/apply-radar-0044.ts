import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ontbreekt");
  const body = readFileSync(
    resolve("drizzle/0044_radar_mixseries.sql"),
    "utf8",
  );
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe(body);
    console.log("Applied 0044_radar_mixseries.sql");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
