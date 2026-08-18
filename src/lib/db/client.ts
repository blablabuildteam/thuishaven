import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  thuishavenSql?: ReturnType<typeof postgres>;
  thuishavenDb?: Db;
};

/**
 * Lazy DB client — only connects when DATABASE_URL is set.
 * Until then, UI routes use mock data so the app is runnable offline.
 */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL ontbreekt. Zet deze in .env.local of blijf mockdata gebruiken.",
    );
  }

  if (!globalForDb.thuishavenDb) {
    globalForDb.thuishavenSql = postgres(url, { prepare: false, max: 1 });
    globalForDb.thuishavenDb = drizzle(globalForDb.thuishavenSql, { schema });
  }
  return globalForDb.thuishavenDb;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function endDb(): Promise<void> {
  if (globalForDb.thuishavenSql) {
    await globalForDb.thuishavenSql.end({ timeout: 5 });
    globalForDb.thuishavenSql = undefined;
    globalForDb.thuishavenDb = undefined;
  }
}
