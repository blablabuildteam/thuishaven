/**
 * Venue availability — DB-backed with mock fallback.
 */

import { asc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { venueDays } from "@/lib/db/schema";
import {
  availabilityCalendar as mockCalendar,
  dayStatusLabels,
  formatEuro,
  getPublicAvailabilityUrl,
  openAvailabilityDays as mockOpenDays,
  type AvailabilityDay,
  type DayPart,
  type DayStatus,
  PUBLIC_AVAILABILITY_PATH,
  PUBLIC_AVAILABILITY_URL,
} from "@/lib/mock/availability";

export {
  dayStatusLabels,
  formatEuro,
  getPublicAvailabilityUrl,
  PUBLIC_AVAILABILITY_PATH,
  PUBLIC_AVAILABILITY_URL,
};
export type { AvailabilityDay, DayPart, DayStatus };

function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapRow(row: typeof venueDays.$inferSelect): AvailabilityDay {
  return {
    id: row.id,
    date: toIsoDay(row.date),
    status: row.status,
    dayPart: (row.dayPart as DayPart) || "full",
    label: row.label ?? undefined,
    priceFrom: row.priceFrom != null ? Number(row.priceFrom) : undefined,
    priceNote: row.priceNote ?? undefined,
    areas: Array.isArray(row.areas) ? row.areas : undefined,
    notes: row.notes ?? undefined,
  };
}

export async function listAvailabilityDays(): Promise<{
  days: AvailabilityDay[];
  source: "db" | "mock";
}> {
  if (!hasDatabase()) {
    return { days: mockCalendar, source: "mock" };
  }

  const db = getDb();
  const rows = await db.select().from(venueDays).orderBy(asc(venueDays.date));
  if (rows.length === 0) {
    return { days: mockCalendar, source: "db" };
  }
  return { days: rows.map(mapRow), source: "db" };
}

export async function openAvailabilityDaysLive() {
  const { days } = await listAvailabilityDays();
  return days.filter((d) => d.status === "available");
}

export async function upsertAvailabilityDay(input: {
  id?: string;
  date: string;
  status: DayStatus;
  dayPart?: DayPart;
  label?: string | null;
  priceFrom?: number | null;
  priceNote?: string | null;
  areas?: string[];
  notes?: string | null;
}): Promise<AvailabilityDay> {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL ontbreekt");
  }

  const db = getDb();
  const date = new Date(`${input.date}T12:00:00.000Z`);
  const values = {
    date,
    status: input.status,
    dayPart: input.dayPart ?? "full",
    label: input.label ?? null,
    priceFrom: input.priceFrom != null ? String(input.priceFrom) : null,
    priceNote: input.priceNote ?? null,
    areas: input.areas ?? [],
    notes: input.notes ?? null,
    updatedAt: new Date(),
  };

  if (input.id) {
    const [row] = await db
      .update(venueDays)
      .set(values)
      .where(eq(venueDays.id, input.id))
      .returning();
    if (!row) throw new Error("Dag niet gevonden");
    return mapRow(row);
  }

  const [existing] = await db
    .select()
    .from(venueDays)
    .where(eq(venueDays.date, date))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(venueDays)
      .set(values)
      .where(eq(venueDays.id, existing.id))
      .returning();
    return mapRow(row!);
  }

  const [row] = await db.insert(venueDays).values(values).returning();
  return mapRow(row!);
}

export async function deleteAvailabilityDay(id: string) {
  if (!hasDatabase()) throw new Error("DATABASE_URL ontbreekt");
  const db = getDb();
  await db.delete(venueDays).where(eq(venueDays.id, id));
}

export async function seedAvailabilityFromMockIfEmpty() {
  if (!hasDatabase()) return { inserted: 0 };
  const db = getDb();
  const existing = await db.select({ id: venueDays.id }).from(venueDays).limit(1);
  if (existing.length) return { inserted: 0 };

  await db.insert(venueDays).values(
    mockCalendar.map((d) => ({
      date: new Date(`${d.date}T12:00:00.000Z`),
      status: d.status,
      dayPart: d.dayPart,
      label: d.label ?? null,
      priceFrom: d.priceFrom != null ? String(d.priceFrom) : null,
      priceNote: d.priceNote ?? null,
      areas: d.areas ?? [],
      notes: d.notes ?? null,
    })),
  );
  return { inserted: mockCalendar.length };
}

/** Short text fragment for outbound emails */
export async function availabilitySummaryForEmail(limit = 4): Promise<string> {
  const open = await openAvailabilityDaysLive();
  if (!open.length) {
    return "Bekijk actuele open data op de live agenda.";
  }
  const lines = open.slice(0, limit).map((d) => {
    const price =
      d.priceFrom != null ? ` · vanaf ${formatEuro(d.priceFrom)}` : "";
    return `• ${d.date}${price}`;
  });
  return `Open slots (selectie):\n${lines.join("\n")}\nLive: ${getPublicAvailabilityUrl()}`;
}

export { mockOpenDays };
