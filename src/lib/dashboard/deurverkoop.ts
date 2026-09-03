import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { editions, ticketInventory } from "@/lib/db/schema";

export const updateDeurverkoopSchema = z.object({
  sold: z.union([
    z.coerce
      .number()
      .int("Moet een heel getal zijn")
      .min(0, "Minimaal 0")
      .max(100_000, "Maximaal 100.000"),
    z.null(),
  ]),
});

export async function upsertDeurverkoop(
  editionId: string,
  sold: number | null,
): Promise<
  | { ok: true; sold: number | null }
  | { ok: false; error: "not_found" | "not_ticket_edition" }
> {
  const db = getDb();
  const edition = await db
    .select({ id: editions.id, weeztixEventId: editions.weeztixEventId })
    .from(editions)
    .where(eq(editions.id, editionId))
    .limit(1);

  if (!edition[0]) return { ok: false, error: "not_found" };
  if (!edition[0].weeztixEventId) {
    return { ok: false, error: "not_ticket_edition" };
  }

  const existing = await db
    .select({ id: ticketInventory.id })
    .from(ticketInventory)
    .where(
      and(
        eq(ticketInventory.editionId, editionId),
        eq(ticketInventory.platform, "internal"),
      ),
    )
    .limit(1);

  if (sold == null) {
    if (existing[0]) {
      await db
        .delete(ticketInventory)
        .where(eq(ticketInventory.id, existing[0].id));
    }
    return { ok: true, sold: null };
  }

  const values = {
    sold,
    scanned: 0,
    available: 0,
    capacity: sold,
    paidSold: sold,
    freeSold: 0,
    revenueCents: 0,
    syncedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(ticketInventory)
      .set(values)
      .where(eq(ticketInventory.id, existing[0].id));
  } else {
    await db.insert(ticketInventory).values({
      editionId,
      platform: "internal",
      ...values,
    });
  }

  return { ok: true, sold };
}
