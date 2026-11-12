import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ontbreekt");
  const body = readFileSync(
    resolve("drizzle/0046_radar_label_watch.sql"),
    "utf8",
  );
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe(body);
    console.log("Applied 0046_radar_label_watch.sql");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
