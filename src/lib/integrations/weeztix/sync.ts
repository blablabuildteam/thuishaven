import { eq, isNotNull } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";
import {
  listWeeztixEventTickets,
  listWeeztixEvents,
  type WeeztixEvent,
  type WeeztixTicketType,
} from "@/lib/integrations/weeztix/client";
import { amsterdamDay } from "@/lib/time/amsterdam";
import { estimateSoldOutFromTicketTypes } from "@/lib/editions/sold-out-timing";
import {
  channelHasTicketTypes,
  DERIVED_PLATFORM_CHANNEL,
  summarizeWeeztixChannels,
  WEEZTIX_DERIVED_PLATFORMS,
  type ChannelInventorySummary,
  type WeeztixDerivedPlatform,
} from "@/lib/integrations/weeztix/channels";
import { resolveWeeztixSoldOut } from "@/lib/integrations/weeztix/sold-out";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "event"
  );
}

export function summarizeTicketSales(tickets: WeeztixTicketType[]): {
  sold: number;
  scanned: number;
  paidSold: number;
  freeSold: number;
  capacity: number | null;
  available: number;
  revenueCents: number;
  avgPriceCents: number | null;
  ticketTypes: number;
} {
  let sold = 0;
  let scanned = 0;
  let paidSold = 0;
  let freeSold = 0;
  let capacitySum = 0;
  let hasStock = false;
  let revenueCents = 0;

  for (const t of tickets) {
    const s = typeof t.sold_count === "number" ? t.sold_count : 0;
    const scannedCount =
      typeof t.scanned_count === "number" ? t.scanned_count : 0;
    scanned += scannedCount;
    const stock =
      typeof t.available_stock === "number" ? t.available_stock : null;
    const price = typeof t.min_price === "number" ? t.min_price : 0;
    sold += s;
    if (price > 0) {
      paidSold += s;
      if (s > 0) revenueCents += s * price;
    } else {
      freeSold += s;
    }
    /**
     * Weeztix `available_stock` is de toegewezen ticketcap per type, ook als
     * status=sold_out (blijft bv. 1050 staan i.p.v. 0). Niet “nog te koop”.
     * Cap = som van allotments; nog = cap − sold.
     */
    if (stock != null) {
      hasStock = true;
      capacitySum += Math.max(stock, s);
    }
  }

  const capacity = hasStock ? capacitySum : sold > 0 ? sold : null;
  const available =
    capacity != null ? Math.max(0, capacity - sold) : 0;

  return {
    sold,
    scanned,
    paidSold,
    freeSold,
    capacity,
    available,
    revenueCents,
    avgPriceCents: paidSold > 0 ? Math.round(revenueCents / paidSold) : null,
    ticketTypes: tickets.length,
  };
}

/**
 * Haalt Weeztix-events op (GET) en schrijft alleen naar onze DB.
 * Ticketstats via /event/{guid}/ticket (sold_count).
 */
export async function syncWeeztixReadOnly(options?: {
  includeStats?: boolean;
  /** Max events voor ticketstats. Default: alles. */
  statsLimit?: number;
}): Promise<{
  ok: boolean;
  source: string;
  eventsFetched: number;
  editionsUpserted: number;
  inventoryUpserted: number;
  error?: string;
  preview?: Array<{ guid: string; name: string }>;
}> {
  const includeStats = options?.includeStats ?? true;
  const statsLimit = options?.statsLimit;

  const listed = await listWeeztixEvents();
  if (!listed.ok) {
    return {
      ok: false,
      source: "weeztix",
      eventsFetched: 0,
      editionsUpserted: 0,
      inventoryUpserted: 0,
      error: listed.error,
    };
  }

  const events = listed.events.filter(
    (e) => e.guid && e.name && !/TEMPLATE/i.test(String(e.name)),
  );
  const preview = events.slice(0, 20).map((e) => ({
    guid: String(e.guid),
    name: String(e.name),
  }));

  if (!hasDatabase()) {
    return {
      ok: true,
      source: "weeztix",
      eventsFetched: events.length,
      editionsUpserted: 0,
      inventoryUpserted: 0,
      error: "DATABASE_URL ontbreekt — events wel opgehaald, niet opgeslagen",
      preview,
    };
  }

  const db = getDb();
  let editionsUpserted = 0;
  const editionByGuid = new Map<string, string>();

  for (const event of events) {
    const guid = String(event.guid);
    const name = String(event.name);
    const startsAt = event.start ? new Date(String(event.start)) : new Date();
    const endsAt = event.end ? new Date(String(event.end)) : null;

    const existing = await db
      .select()
      .from(editions)
      .where(eq(editions.weeztixEventId, guid))
      .limit(1);

    let editionId = "";
    if (existing[0]) {
      await db
        .update(editions)
        .set({
          name,
          startsAt: Number.isNaN(startsAt.getTime())
            ? existing[0].startsAt
            : startsAt,
          endsAt:
            endsAt && !Number.isNaN(endsAt.getTime())
              ? endsAt
              : existing[0].endsAt,
        })
        .where(eq(editions.id, existing[0].id));
      editionId = existing[0].id;
    } else {
      const baseSlug = slugify(name);
      for (let i = 0; i < 5; i++) {
        try {
          const inserted = await db
            .insert(editions)
            .values({
              name,
              slug: i === 0 ? baseSlug : `${baseSlug}-${guid.slice(0, 8)}`,
              startsAt: Number.isNaN(startsAt.getTime())
                ? new Date()
                : startsAt,
              endsAt:
                endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
              status: "upcoming",
              weeztixEventId: guid,
            })
            .returning({ id: editions.id });
          editionId = inserted[0].id;
          break;
        } catch {
          if (i === 4) throw new Error(`Kon editie niet inserten: ${name}`);
        }
      }
    }
    if (!editionId) continue;
    editionByGuid.set(guid, editionId);
    editionsUpserted += 1;
  }

  let inventoryUpserted = 0;
  if (includeStats) {
    const forStats =
      statsLimit != null ? events.slice(0, statsLimit) : events;
    const startsAtByEdition = new Map<string, Date>();
    for (const e of forStats) {
      const editionId = editionByGuid.get(String(e.guid));
      if (!editionId) continue;
      const startsAt = e.start ? new Date(e.start) : new Date();
      startsAtByEdition.set(editionId, startsAt);
    }
    const result = await upsertTicketInventoryForEvents(
      forStats
        .map((e) => ({
          guid: String(e.guid),
          editionId: editionByGuid.get(String(e.guid))!,
        }))
        .filter((x) => x.editionId),
      { startsAtByEdition },
    );
    inventoryUpserted = result.upserted;
  }

  return {
    ok: true,
    source: "weeztix",
    eventsFetched: events.length,
    editionsUpserted,
    inventoryUpserted,
    preview,
  };
}

/**
 * Historische ticketstats voor alle edities in DB (of subset).
 * Gebruikt GET /event/{guid}/ticket — read-only.
 */
export async function syncWeeztixTicketStatsFromEditions(options?: {
  concurrency?: number;
  onlyMissing?: boolean;
}): Promise<{
  ok: boolean;
  attempted: number;
  upserted: number;
  failed: number;
  totalSold: number;
  errors: string[];
}> {
  if (!hasDatabase()) {
    return {
      ok: false,
      attempted: 0,
      upserted: 0,
      failed: 0,
      totalSold: 0,
      errors: ["DATABASE_URL ontbreekt"],
    };
  }

  const db = getDb();
  const rows = await db
    .select({
      id: editions.id,
      guid: editions.weeztixEventId,
      name: editions.name,
    })
    .from(editions)
    .where(isNotNull(editions.weeztixEventId));

  let targets = rows.filter(
    (r) => r.guid && r.name && !/TEMPLATE/i.test(r.name),
  ) as Array<{ id: string; guid: string; name: string }>;

  if (options?.onlyMissing) {
    const inv = await db
      .select({ editionId: ticketInventory.editionId })
      .from(ticketInventory)
      .where(eq(ticketInventory.platform, "weeztix"));
    const have = new Set(inv.map((i) => i.editionId));
    targets = targets.filter((t) => !have.has(t.id));
  }

  const mapped = targets.map((t) => ({
    guid: String(t.guid),
    editionId: t.id,
  }));

  // startsAt needed for sold-out timing
  const starts = await db
    .select({ id: editions.id, startsAt: editions.startsAt })
    .from(editions)
    .where(isNotNull(editions.weeztixEventId));
  const startsById = new Map(starts.map((s) => [s.id, s.startsAt]));

  return upsertTicketInventoryForEvents(mapped, {
    concurrency: options?.concurrency ?? 4,
    startsAtByEdition: startsById,
  });
}

async function upsertDerivedChannelInventory(
  db: ReturnType<typeof getDb>,
  editionId: string,
  platform: WeeztixDerivedPlatform,
  summary: ChannelInventorySummary,
  persist: boolean,
  existingRows: Array<{ id: string; platform: string }>,
) {
  const existing = existingRows.find((r) => r.platform === platform);
  if (!persist && !existing) return;

  const values = {
    sold: summary.sold,
    scanned: summary.scanned,
    capacity: summary.capacity,
    available: summary.available,
    paidSold: 0,
    freeSold: summary.sold,
    revenueCents: 0,
    syncedAt: new Date(),
  };

  if (existing) {
    await db
      .update(ticketInventory)
      .set(values)
      .where(eq(ticketInventory.id, existing.id));
    return;
  }

  if (!persist) return;

  await db.insert(ticketInventory).values({
    editionId,
    platform,
    ...values,
  });
}

async function upsertTicketInventoryForEvents(
  items: Array<{ guid: string; editionId: string }>,
  options?: {
    concurrency?: number;
    startsAtByEdition?: Map<string, Date>;
  },
): Promise<{
  ok: boolean;
  attempted: number;
  upserted: number;
  failed: number;
  totalSold: number;
  errors: string[];
}> {
  const db = getDb();
  const concurrency = Math.max(1, options?.concurrency ?? 4);
  let upserted = 0;
  let failed = 0;
  let totalSold = 0;
  const errors: string[] = [];

  async function one(item: { guid: string; editionId: string }) {
    const ticketsRes = await listWeeztixEventTickets(item.guid);
    if (!ticketsRes.ok) {
      failed += 1;
      if (errors.length < 15) {
        errors.push(`${item.guid.slice(0, 8)}: ${ticketsRes.error}`);
      }
      return;
    }

    const tickets = ticketsRes.tickets;
    const summary = summarizeTicketSales(tickets);
    const channels = summarizeWeeztixChannels(tickets);
    totalSold += summary.sold;

    const inv = await db
      .select({ id: ticketInventory.id, platform: ticketInventory.platform })
      .from(ticketInventory)
      .where(eq(ticketInventory.editionId, item.editionId))
      .limit(20);
    const weeztixRow = inv.find((r) => r.platform === "weeztix");
    const verdict = resolveWeeztixSoldOut({
      tickets,
      sold: summary.sold,
      capacity: summary.capacity,
    });
    const isSoldOut = verdict.soldOut;

    const startsAt = options?.startsAtByEdition?.get(item.editionId);
    const timing =
      isSoldOut && startsAt
        ? estimateSoldOutFromTicketTypes({
            eventDay: amsterdamDay(startsAt),
            sold: summary.sold,
            capacity: summary.capacity,
            tickets,
            assumeSoldOut: true,
          })
        : null;

    const soldOutFields = {
      soldOutDay: timing?.day ?? null,
      soldOutDaysBefore: timing?.daysBefore ?? null,
      soldOutSource: timing?.source ?? verdict.reason,
    };

    if (weeztixRow) {
      await db
        .update(ticketInventory)
        .set({
          sold: summary.sold,
          scanned: summary.scanned,
          paidSold: summary.paidSold,
          freeSold: summary.freeSold,
          revenueCents: summary.revenueCents,
          capacity: summary.capacity,
          available: summary.available,
          avgPriceEur:
            summary.avgPriceCents != null
              ? (summary.avgPriceCents / 100).toFixed(2)
              : null,
          isSoldOut,
          ...soldOutFields,
          syncedAt: new Date(),
        })
        .where(eq(ticketInventory.id, weeztixRow.id));
    } else {
      await db.insert(ticketInventory).values({
        editionId: item.editionId,
        platform: "weeztix",
        capacity: summary.capacity,
        sold: summary.sold,
        scanned: summary.scanned,
        paidSold: summary.paidSold,
        freeSold: summary.freeSold,
        revenueCents: summary.revenueCents,
        available: summary.available,
        avgPriceEur:
          summary.avgPriceCents != null
            ? (summary.avgPriceCents / 100).toFixed(2)
            : null,
        isSoldOut,
        ...soldOutFields,
      });
    }

    for (const platform of WEEZTIX_DERIVED_PLATFORMS) {
      const channel = DERIVED_PLATFORM_CHANNEL[platform];
      await upsertDerivedChannelInventory(
        db,
        item.editionId,
        platform,
        channels[channel],
        channelHasTicketTypes(tickets, channel),
        inv,
      );
    }

    upserted += 1;
  }

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map((item) => one(item)));
  }

  try {
    const { refreshDashboardAlerts } = await import(
      "@/lib/integrations/alerts"
    );
    await refreshDashboardAlerts();
  } catch {
    // RA-listings of schema nog niet klaar — Weeztix-sync mag niet falen.
  }

  return {
    ok: failed === 0 || upserted > 0,
    attempted: items.length,
    upserted,
    failed,
    totalSold,
    errors,
  };
}

export function summarizeWeeztixEvent(event: WeeztixEvent) {
  return {
    guid: event.guid,
    name: event.name,
    start: event.start,
    end: event.end,
  };
}
