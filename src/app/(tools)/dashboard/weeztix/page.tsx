import { desc, isNotNull } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions } from "@/lib/db/schema";
import { syncWeeztixReadOnly } from "@/lib/integrations/weeztix/sync";

export const metadata = { title: "Weeztix events" };
export const dynamic = "force-dynamic";

export default async function WeeztixEventsPage() {
  let synced = { eventsFetched: 0, editionsUpserted: 0, inventoryUpserted: 0 };
  let rows: Array<{
    id: string;
    name: string;
    startsAt: Date;
    endsAt: Date | null;
    weeztixEventId: string | null;
    status: string;
  }> = [];

  if (hasDatabase()) {
    try {
      // Lichte sync: events + stats voor 25 dichtstbijzijnde
      const result = await syncWeeztixReadOnly({
        includeStats: true,
        statsLimit: 25,
      });
      synced = {
        eventsFetched: result.eventsFetched,
        editionsUpserted: result.editionsUpserted,
        inventoryUpserted: result.inventoryUpserted,
      };
    } catch (e) {
      console.error("weeztix page sync", e);
    }

    const db = getDb();
    rows = await db
      .select({
        id: editions.id,
        name: editions.name,
        startsAt: editions.startsAt,
        endsAt: editions.endsAt,
        weeztixEventId: editions.weeztixEventId,
        status: editions.status,
      })
      .from(editions)
      .where(isNotNull(editions.weeztixEventId))
      .orderBy(desc(editions.startsAt))
      .limit(50);
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Weeztix · read-only"
        title="Live events"
        description="Events opgehaald uit Weeztix (alleen GET) en opgeslagen in onze database. Nog geen schrijfacties terug."
      />

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Events in Weeztix"
          value={String(synced.eventsFetched || rows.length)}
          accent
        />
        <MetricCard
          label="In onze DB"
          value={String(synced.editionsUpserted || rows.length)}
        />
        <MetricCard
          label="Stats bijgewerkt"
          value={String(synced.inventoryUpserted)}
          hint="max. 25 dichtstbijzijnde"
        />
      </div>

      {!hasDatabase() && (
        <p className="mb-4 border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          Geen DATABASE_URL — events kunnen niet worden opgeslagen.
        </p>
      )}

      <section className="border border-border bg-surface p-4">
        <h2 className="mb-4 font-display text-2xl tracking-[0.06em]">
          Laatste 50 edities
        </h2>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div>
                <p className="text-sm font-medium text-text">{row.name}</p>
                <p className="text-xs text-text-muted">
                  {row.startsAt.toLocaleDateString("nl-NL", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {row.weeztixEventId
                    ? ` · ${row.weeztixEventId.slice(0, 8)}…`
                    : ""}
                </p>
              </div>
              <StatusBadge tone="accent">Weeztix</StatusBadge>
            </li>
          ))}
          {!rows.length && (
            <li className="py-6 text-sm text-text-muted">
              Nog geen Weeztix-events in de database. Sync via API of herlaad
              deze pagina.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
