import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazy DB client — only connects when DATABASE_URL is set.
 * Until then, UI routes use mock data so the app is runnable offline.
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL ontbreekt. Zet deze in .env.local of blijf mockdata gebruiken.",
    );
  }

  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
