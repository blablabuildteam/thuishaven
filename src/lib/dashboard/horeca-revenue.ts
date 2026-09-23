import { and, asc, eq, ilike, isNotNull, isNull, not, sql } from "drizzle-orm";
import { z } from "zod";
import {
  addDjFeeRangeToSpend,
  emptyDjFeeSpend,
  isDjFeeRangeId,
  type DjFeeSpend,
} from "@/lib/dashboard/dj-fee-ranges";
import { isHorecaComplete, type HorecaRevenueEvent } from "@/lib/dashboard/horeca-amounts";
import { ticketRevenueExclBtwCents } from "@/lib/dashboard/ticket-btw";
import { getDb } from "@/lib/db/client";
import { djFeeArtists, editions, horecaRevenue, marketingAds, ticketInventory } from "@/lib/db/schema";
import { amsterdamDay } from "@/lib/time/amsterdam";

const centsField = z.union([
  z
    .number()
    .int("Bedrag moet in centen")
    .min(0, "Bedrag kan niet negatief zijn")
    .max(1_000_000_000, "Bedrag is te hoog"),
  z.null(),
]);

export const updateHorecaRevenueSchema = z
  .object({
    barCents: centsField.optional(),
    kitchenCents: centsField.optional(),
  })
  .refine((value) => value.barCents !== undefined || value.kitchenCents !== undefined, {
    message: "Niets om bij te werken",
  });

export type HorecaRevenuePatch = z.infer<typeof updateHorecaRevenueSchema>;

/** Omzet begint bij Alisha 10hrs. Alleen events die al geweest zijn. */
const OMZET_FROM_DAY = "2026-09-20";

export function showOnOmzetBoard(
  event: { name: string; day: string },
  today: string,
): boolean {
  if (event.day >= today) return false;
  if (event.day >= OMZET_FROM_DAY) return true;
  return /alisha/i.test(event.name) && /10\s*hrs/i.test(event.name);
}

/** Zichtbare events waar bar of keuken nog leeg is. */
export async function countPendingHorecaEvents(): Promise<number> {
  const db = getDb();
  const today = amsterdamDay(new Date());
  const rows = await db
    .select({
      name: editions.name,
      startsAt: editions.startsAt,
      barCents: horecaRevenue.barCents,
      kitchenCents: horecaRevenue.kitchenCents,
    })
    .from(editions)
    .leftJoin(horecaRevenue, eq(horecaRevenue.editionId, editions.id))
    .where(
      and(isNotNull(editions.weeztixEventId), not(ilike(editions.name, "%TEMPLATE%"))),
    );

  return rows.filter((row) => {
    const event = { name: row.name, day: amsterdamDay(row.startsAt) };
    return (
      showOnOmzetBoard(event, today) &&
      !isHorecaComplete(row.barCents, row.kitchenCents)
    );
  }).length;
}

export async function loadHorecaRevenueBoard(): Promise<HorecaRevenueEvent[]> {
  const db = getDb();
  const [rows, inventoryRows, djRows, adRows] = await Promise.all([
    db
      .select({
        id: editions.id,
        name: editions.name,
        startsAt: editions.startsAt,
        barCents: horecaRevenue.barCents,
        kitchenCents: horecaRevenue.kitchenCents,
      })
      .from(editions)
      .leftJoin(horecaRevenue, eq(horecaRevenue.editionId, editions.id))
      .where(isNotNull(editions.weeztixEventId))
      .orderBy(asc(editions.startsAt)),
    db
      .select({
        editionId: ticketInventory.editionId,
        revenueCents: ticketInventory.revenueCents,
      })
      .from(ticketInventory)
      .where(eq(ticketInventory.platform, "weeztix")),
    db
      .select({
        editionId: djFeeArtists.editionId,
        feeRange: djFeeArtists.feeRange,
      })
      .from(djFeeArtists)
      .where(isNull(djFeeArtists.removedAt)),
    db
      .select({
        editionId: marketingAds.editionId,
        spendCents: sql<number>`coalesce(sum(${marketingAds.spendCents}), 0)::int`,
      })
      .from(marketingAds)
      .where(isNotNull(marketingAds.editionId))
      .groupBy(marketingAds.editionId),
  ]);

  const ticketByEdition = new Map<string, number>();
  for (const row of inventoryRows) {
    const excl = ticketRevenueExclBtwCents(row.revenueCents);
    const current = ticketByEdition.get(row.editionId);
    if (current == null || excl > current) ticketByEdition.set(row.editionId, excl);
  }

  const djByEdition = new Map<string, DjFeeSpend>();
  for (const row of djRows) {
    const spend = djByEdition.get(row.editionId) ?? emptyDjFeeSpend();
    const range = row.feeRange && isDjFeeRangeId(row.feeRange) ? row.feeRange : null;
    addDjFeeRangeToSpend(spend, range);
    djByEdition.set(row.editionId, spend);
  }

  const adsByEdition = new Map<string, number>();
  for (const row of adRows) {
    if (!row.editionId) continue;
    adsByEdition.set(row.editionId, Number(row.spendCents) || 0);
  }

  return rows
    .filter((row) => !/TEMPLATE/i.test(row.name))
    .map((row) => ({
      id: row.id,
      name: row.name,
      day: amsterdamDay(row.startsAt),
      barCents: row.barCents,
      kitchenCents: row.kitchenCents,
      ticketExclCents: ticketByEdition.get(row.id) ?? null,
      djFees: djByEdition.get(row.id) ?? null,
      adsCents: adsByEdition.get(row.id) ?? 0,
    }));
}

export async function updateHorecaRevenue(
  editionId: string,
  patch: HorecaRevenuePatch,
  updatedByEmail: string | null,
): Promise<
  | { ok: true; name: string; barCents: number | null; kitchenCents: number | null }
  | { ok: false; error: "not_found" | "not_ticket_edition" }
> {
  const db = getDb();
  const edition = await db
    .select({
      id: editions.id,
      name: editions.name,
      weeztixEventId: editions.weeztixEventId,
    })
    .from(editions)
    .where(eq(editions.id, editionId))
    .limit(1);

  const row = edition[0];
  if (!row) return { ok: false, error: "not_found" };
  if (!row.weeztixEventId) return { ok: false, error: "not_ticket_edition" };

  const now = new Date();
  const set: {
    barCents?: number | null;
    kitchenCents?: number | null;
    updatedByEmail: string | null;
    updatedAt: Date;
  } = {
    updatedByEmail,
    updatedAt: now,
  };
  if (patch.barCents !== undefined) set.barCents = patch.barCents;
  if (patch.kitchenCents !== undefined) set.kitchenCents = patch.kitchenCents;

  await db
    .insert(horecaRevenue)
    .values({
      editionId,
      barCents: patch.barCents ?? null,
      kitchenCents: patch.kitchenCents ?? null,
      updatedByEmail,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: horecaRevenue.editionId,
      set,
    });

  await db
    .delete(horecaRevenue)
    .where(
      and(
        eq(horecaRevenue.editionId, editionId),
        isNull(horecaRevenue.barCents),
        isNull(horecaRevenue.kitchenCents),
      ),
    );

  const saved = await db
    .select({
      barCents: horecaRevenue.barCents,
      kitchenCents: horecaRevenue.kitchenCents,
    })
    .from(horecaRevenue)
    .where(eq(horecaRevenue.editionId, editionId))
    .limit(1);

  return {
    ok: true,
    name: row.name,
    barCents: saved[0]?.barCents ?? null,
    kitchenCents: saved[0]?.kitchenCents ?? null,
  };
}
