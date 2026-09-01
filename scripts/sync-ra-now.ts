import { config } from "dotenv";
config({ path: ".env.local" });

import { sql } from "drizzle-orm";
import { endDb, getDb } from "../src/lib/db/client";
import { editions, externalEvents } from "../src/lib/db/schema";
import { syncResidentAdvisorReadOnly } from "../src/lib/integrations/ra/sync";
import { parseRaImpactNote } from "../src/lib/integrations/ra/genres";
import { amsterdamDay } from "../src/lib/time/amsterdam";

function overlapsDay(dayIso: string, start: Date, end: Date | null): boolean {
  const day = dayIso.slice(0, 10);
  const startDay = amsterdamDay(start);
  if (!end) return day === startDay;
  const endDay = amsterdamDay(end);
  return day >= startDay && day <= endDay;
}

async function main() {
  const started = Date.now();
  console.log("[ra-sync] starting…");
  const result = await syncResidentAdvisorReadOnly();
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log("[ra-sync] done in", elapsedSec, "s");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
    return;
  }

  const db = getDb();
  const today = amsterdamDay(new Date());
  const festivals = await db.select().from(externalEvents);
  const ra = festivals.filter((f) => f.source === "resident_advisor");
  const withGenres = ra.filter(
    (f) => parseRaImpactNote(f.impactNote).genres.length > 0,
  ).length;

  const upcoming = await db
    .select({ id: editions.id, name: editions.name, startsAt: editions.startsAt })
    .from(editions)
    .where(sql`${editions.startsAt} >= ${today}::date`)
    .orderBy(editions.startsAt)
    .limit(12);

  console.log(
    `[ra-sync] external_events RA=${ra.length} (with genres=${withGenres}) total=${festivals.length}`,
  );

  for (const ed of upcoming) {
    const day = amsterdamDay(ed.startsAt);
    const hits = festivals
      .filter((f) => overlapsDay(day, f.startsAt, f.endsAt))
      .map((f) => {
        const meta = parseRaImpactNote(f.impactNote);
        return {
          name: f.name,
          type: f.type,
          genre: meta.genres[0] ?? null,
          attending: meta.attending,
        };
      });
    console.log(
      `[compete] ${day} · ${hits.length} · ${ed.name.slice(0, 60)}${hits.length ? ` → ${hits
        .slice(0, 3)
        .map((h) => h.name)
        .join("; ")}` : ""}`,
    );
  }
}

main()
  .catch((e) => {
    console.error("[ra-sync] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await endDb().catch(() => undefined);
  });
