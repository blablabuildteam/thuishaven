import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { editions } from "@/lib/db/schema";

export const updateExpectedAttendeesSchema = z.object({
  expectedAttendees: z.union([
    z.coerce
      .number()
      .int("Moet een heel getal zijn")
      .min(1, "Minimaal 1")
      .max(100_000, "Maximaal 100.000"),
    z.null(),
  ]),
});

export async function updateEditionExpectedAttendees(
  editionId: string,
  expectedAttendees: number | null,
): Promise<
  | { ok: true; expectedAttendees: number | null }
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

  await db
    .update(editions)
    .set({ expectedAttendees })
    .where(eq(editions.id, editionId));

  return { ok: true, expectedAttendees };
}
