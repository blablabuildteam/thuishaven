import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, not } from "drizzle-orm";
import { z } from "zod";
import {
  addDjFeeRangeToSpend,
  DJ_FEES_FROM_YEAR,
  djFeeSpendMidpoint,
  djFeesFromDate,
  emptyDjFeeSpend,
  formatDjFeeSpend,
  isDjFeeRangeId,
  rankDjFeeInvestment,
  type DjFeeArtistSource,
  type DjFeeArtistView,
  type DjFeeEventView,
  type DjFeeRangeId,
  type DjFeeSpend,
} from "@/lib/dashboard/dj-fee-ranges";
import { DASHBOARD_TTL_MS, rememberTtl } from "@/lib/cache/ttl";
import { getDb } from "@/lib/db/client";
import { djFeeArtists, editions, raListings, ticketInventory } from "@/lib/db/schema";
import {
  editionFormat,
  normalizeArtistKey,
  parseEditionLineup,
} from "@/lib/editions/lineup";
import { amsterdamDay } from "@/lib/time/amsterdam";

export const DJ_FEE_RANGE_ZOD = z.enum([
  "0_600",
  "600_1000",
  "1000_2500",
  "2500_5000",
  "5000_10000",
  "10000_plus",
]);

export const addDjFeeArtistSchema = z.object({
  editionId: z.string().uuid(),
  name: z.string().trim().min(1, "Naam ontbreekt").max(80, "Naam is te lang"),
});

export const updateDjFeeArtistSchema = z
  .object({
    feeRange: z.union([DJ_FEE_RANGE_ZOD, z.null()]).optional(),
    isTenHour: z.boolean().optional(),
  })
  .refine((v) => v.feeRange !== undefined || v.isTenHour !== undefined, {
    message: "Niets om bij te werken",
  });

export type { DjFeeArtistView, DjFeeEventView } from "@/lib/dashboard/dj-fee-ranges";

function asSource(value: string): DjFeeArtistSource {
  if (value === "edition_name" || value === "custom") return value;
  return "resident_advisor";
}

function asRange(value: string | null): DjFeeRangeId | null {
  if (!value || !isDjFeeRangeId(value)) return null;
  return value;
}

function cleanArtistName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 1) return null;
  return name.slice(0, 80);
}

function artistKey(name: string): string | null {
  const key = normalizeArtistKey(name);
  return key.length >= 2 ? key : null;
}

function spendForArtists(artists: DjFeeArtistView[]): DjFeeSpend {
  const spend = emptyDjFeeSpend();
  for (const artist of artists) {
    addDjFeeRangeToSpend(spend, artist.feeRange);
  }
  return spend;
}

function raArtistsByEdition(
  listingRows: Array<{ editionId: string | null; artists: string[] }>,
): Map<string, string[]> {
  const raByEdition = new Map<string, string[]>();
  for (const row of listingRows) {
    if (!row.editionId) continue;
    const names = (row.artists ?? []).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) continue;
    const current = raByEdition.get(row.editionId) ?? [];
    raByEdition.set(row.editionId, current);
    const seen = new Set(current.map((n) => normalizeArtistKey(n)));
    for (const name of names) {
      const key = normalizeArtistKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      current.push(name);
    }
  }
  return raByEdition;
}

function plannedArtistInserts(
  editionRows: Array<{ id: string; name: string }>,
  raByEdition: Map<string, string[]>,
  existing: Set<string>,
): Array<{
  editionId: string;
  name: string;
  nameKey: string;
  isTenHour: boolean;
  source: DjFeeArtistSource;
  sortOrder: number;
}> {
  const toInsert: Array<{
    editionId: string;
    name: string;
    nameKey: string;
    isTenHour: boolean;
    source: DjFeeArtistSource;
    sortOrder: number;
  }> = [];

  for (const edition of editionRows) {
    if (/TEMPLATE/i.test(edition.name)) continue;
    const lineup = parseEditionLineup(edition.name);
    const raArtists = raByEdition.get(edition.id) ?? [];
    const names = raArtists.length > 0 ? raArtists : lineup.artists;
    const source: DjFeeArtistSource =
      raArtists.length > 0 ? "resident_advisor" : "edition_name";
    names.forEach((raw, index) => {
      const name = cleanArtistName(raw);
      if (!name) return;
      const nameKey = artistKey(name);
      if (!nameKey) return;
      const stamp = `${edition.id}:${nameKey}`;
      if (existing.has(stamp)) return;
      existing.add(stamp);
      toInsert.push({
        editionId: edition.id,
        name,
        nameKey,
        isTenHour: false,
        source,
        sortOrder: index,
      });
    });
  }

  return toInsert;
}

export async function loadDjFeeBoard(): Promise<DjFeeEventView[]> {
  return rememberTtl("dj-fee-board", DASHBOARD_TTL_MS, loadDjFeeBoardFresh);
}

async function loadDjFeeBoardFresh(): Promise<DjFeeEventView[]> {
  const db = getDb();

  const [editionRows, listingRows, artistRows] = await Promise.all([
    db
      .select({
        id: editions.id,
        name: editions.name,
        startsAt: editions.startsAt,
      })
      .from(editions)
      .where(
        and(
          isNotNull(editions.weeztixEventId),
          gte(editions.startsAt, djFeesFromDate()),
        ),
      )
      .orderBy(asc(editions.startsAt)),
    db
      .select({
        editionId: raListings.editionId,
        artists: raListings.artists,
      })
      .from(raListings)
      .where(isNotNull(raListings.editionId)),
    db
      .select({
        id: djFeeArtists.id,
        editionId: djFeeArtists.editionId,
        name: djFeeArtists.name,
        nameKey: djFeeArtists.nameKey,
        feeRange: djFeeArtists.feeRange,
        isTenHour: djFeeArtists.isTenHour,
        source: djFeeArtists.source,
        sortOrder: djFeeArtists.sortOrder,
        createdAt: djFeeArtists.createdAt,
        removedAt: djFeeArtists.removedAt,
      })
      .from(djFeeArtists),
  ]);

  const raByEdition = raArtistsByEdition(listingRows);
  const existing = new Set(
    artistRows.map((row) => `${row.editionId}:${row.nameKey}`),
  );
  const toInsert = plannedArtistInserts(editionRows, raByEdition, existing);

  const inserted =
    toInsert.length === 0
      ? []
      : await db
          .insert(djFeeArtists)
          .values(toInsert)
          .onConflictDoNothing({
            target: [djFeeArtists.editionId, djFeeArtists.nameKey],
          })
          .returning();

  const artistsByEdition = new Map<string, DjFeeArtistView[]>();
  const merged = [...artistRows, ...inserted].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  for (const row of merged) {
    if (row.removedAt) continue;
    const list = artistsByEdition.get(row.editionId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      feeRange: asRange(row.feeRange),
      isTenHour: row.isTenHour,
      source: asSource(row.source),
    });
    artistsByEdition.set(row.editionId, list);
  }

  return editionRows
    .filter((row) => !/TEMPLATE/i.test(row.name))
    .map((row) => {
      const lineup = parseEditionLineup(row.name);
      const format = editionFormat(row.name, lineup.kind, lineup.isNachtshow);
      const raArtists = raByEdition.get(row.id) ?? [];
      const artists = artistsByEdition.get(row.id) ?? [];
      const artistsSource =
        raArtists.length > 0
          ? ("resident_advisor" as const)
          : lineup.artists.length > 0
            ? ("edition_name" as const)
            : ("none" as const);
      return {
        id: row.id,
        name: row.name,
        day: amsterdamDay(row.startsAt),
        startsAt: row.startsAt.toISOString(),
        isTenHourEvent: format === "hrs10",
        artistsSource,
        artists,
        spend: spendForArtists(artists),
      };
    });
}

/** 2026+ events that still have at least one DJ without a fee range. */
export async function countPendingDjFeeEvents(): Promise<number> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ editionId: djFeeArtists.editionId })
    .from(djFeeArtists)
    .innerJoin(editions, eq(editions.id, djFeeArtists.editionId))
    .where(
      and(
        isNull(djFeeArtists.removedAt),
        isNull(djFeeArtists.feeRange),
        isNotNull(editions.weeztixEventId),
        gte(editions.startsAt, djFeesFromDate()),
        not(ilike(editions.name, "%TEMPLATE%")),
      ),
    );
  return rows.length;
}

export type DjFeeInsightsRow = {
  name: string;
  day: string;
  status: "upcoming" | "past";
  fillPct: number | null;
  sold: number;
  spendLabel: string;
  priced: number;
  missing: number;
  investmentLevel: 1 | 2 | 3 | 4 | 5 | null;
};

export type DjFeeInsightsSummary = {
  fromYear: number;
  events: number;
  eventsPriced: number;
  eventsIncomplete: number;
  spendLabel: string;
  rows: DjFeeInsightsRow[];
};

export async function loadDjFeeInsightsSummary(): Promise<DjFeeInsightsSummary> {
  const db = getDb();
  const today = amsterdamDay(new Date());
  const editionRows = await db
    .select({
      id: editions.id,
      name: editions.name,
      startsAt: editions.startsAt,
      sold: ticketInventory.sold,
      capacity: ticketInventory.capacity,
    })
    .from(editions)
    .leftJoin(
      ticketInventory,
      and(
        eq(ticketInventory.editionId, editions.id),
        eq(ticketInventory.platform, "weeztix"),
      ),
    )
    .where(
      and(
        isNotNull(editions.weeztixEventId),
        gte(editions.startsAt, djFeesFromDate()),
        not(ilike(editions.name, "%TEMPLATE%")),
      ),
    )
    .orderBy(desc(editions.startsAt));

  const ids = editionRows.map((row) => row.id);
  if (ids.length === 0) {
    return {
      fromYear: DJ_FEES_FROM_YEAR,
      events: 0,
      eventsPriced: 0,
      eventsIncomplete: 0,
      spendLabel: "—",
      rows: [],
    };
  }

  const artistRows = await db
    .select({
      editionId: djFeeArtists.editionId,
      feeRange: djFeeArtists.feeRange,
    })
    .from(djFeeArtists)
    .where(
      and(isNull(djFeeArtists.removedAt), inArray(djFeeArtists.editionId, ids)),
    );

  const byEdition = new Map<string, Array<{ feeRange: DjFeeRangeId | null }>>();
  for (const row of artistRows) {
    const list = byEdition.get(row.editionId) ?? [];
    list.push({ feeRange: asRange(row.feeRange) });
    byEdition.set(row.editionId, list);
  }

  const totalSpend = emptyDjFeeSpend();
  let eventsPriced = 0;
  let eventsIncomplete = 0;
  const rows: DjFeeInsightsRow[] = [];
  const mids: Array<number | null> = [];

  for (const edition of editionRows) {
    const artists = byEdition.get(edition.id) ?? [];
    if (artists.length === 0) continue;
    const spend = emptyDjFeeSpend();
    for (const artist of artists) {
      addDjFeeRangeToSpend(spend, artist.feeRange);
      addDjFeeRangeToSpend(totalSpend, artist.feeRange);
    }
    if (spend.priced > 0) eventsPriced += 1;
    if (spend.missing > 0) eventsIncomplete += 1;

    const day = amsterdamDay(edition.startsAt);
    const sold = edition.sold ?? 0;
    const capacity = edition.capacity;
    mids.push(djFeeSpendMidpoint(spend));
    rows.push({
      name: edition.name,
      day,
      status: day >= today ? "upcoming" : "past",
      fillPct:
        capacity != null && capacity > 0 ? (sold / capacity) * 100 : null,
      sold,
      spendLabel: formatDjFeeSpend(spend),
      priced: spend.priced,
      missing: spend.missing,
      investmentLevel: null,
    });
  }

  const rank = rankDjFeeInvestment(
    mids.filter((mid): mid is number => mid != null),
  );
  for (let i = 0; i < rows.length; i++) {
    const mid = mids[i];
    rows[i]!.investmentLevel = rank && mid != null ? rank(mid) : null;
  }

  return {
    fromYear: DJ_FEES_FROM_YEAR,
    events: rows.length,
    eventsPriced,
    eventsIncomplete,
    spendLabel: formatDjFeeSpend(totalSpend),
    rows: rows.slice(0, 28),
  };
}

export async function addDjFeeArtist(input: {
  editionId: string;
  name: string;
}): Promise<
  | { ok: true; artist: DjFeeArtistView }
  | { ok: false; error: "not_found" | "invalid_name" }
> {
  const db = getDb();
  const name = cleanArtistName(input.name);
  const nameKey = name ? artistKey(name) : null;
  if (!name || !nameKey) return { ok: false, error: "invalid_name" };

  const edition = await db
    .select({ id: editions.id, name: editions.name })
    .from(editions)
    .where(eq(editions.id, input.editionId))
    .limit(1);
  if (!edition[0]) return { ok: false, error: "not_found" };

  const existing = await db
    .select()
    .from(djFeeArtists)
    .where(
      and(
        eq(djFeeArtists.editionId, input.editionId),
        eq(djFeeArtists.nameKey, nameKey),
      ),
    )
    .limit(1);

  const now = new Date();

  if (existing[0]) {
    const row = existing[0];
    if (row.removedAt) {
      const [updated] = await db
        .update(djFeeArtists)
        .set({
          name,
          source: "custom",
          removedAt: null,
          updatedAt: now,
        })
        .where(eq(djFeeArtists.id, row.id))
        .returning();
      if (!updated) return { ok: false, error: "not_found" };
      return {
        ok: true,
        artist: {
          id: updated.id,
          name: updated.name,
          feeRange: asRange(updated.feeRange),
          isTenHour: updated.isTenHour,
          source: asSource(updated.source),
        },
      };
    }
    return {
      ok: true,
      artist: {
        id: row.id,
        name: row.name,
        feeRange: asRange(row.feeRange),
        isTenHour: row.isTenHour,
        source: asSource(row.source),
      },
    };
  }

  const last = await db
    .select({ sortOrder: djFeeArtists.sortOrder })
    .from(djFeeArtists)
    .where(eq(djFeeArtists.editionId, input.editionId))
    .orderBy(asc(djFeeArtists.sortOrder));
  const sortOrder =
    last.length > 0 ? Math.max(...last.map((r) => r.sortOrder)) + 1 : 0;

  const [inserted] = await db
    .insert(djFeeArtists)
    .values({
      editionId: input.editionId,
      name,
      nameKey,
      source: "custom",
      isTenHour: false,
      sortOrder,
    })
    .returning();

  if (!inserted) return { ok: false, error: "not_found" };

  return {
    ok: true,
    artist: {
      id: inserted.id,
      name: inserted.name,
      feeRange: asRange(inserted.feeRange),
      isTenHour: inserted.isTenHour,
      source: asSource(inserted.source),
    },
  };
}

export async function updateDjFeeArtist(
  id: string,
  patch: { feeRange?: DjFeeRangeId | null; isTenHour?: boolean },
): Promise<
  | { ok: true; artist: DjFeeArtistView }
  | { ok: false; error: "not_found" }
> {
  const db = getDb();
  const existing = await db
    .select({ id: djFeeArtists.id })
    .from(djFeeArtists)
    .where(and(eq(djFeeArtists.id, id), isNull(djFeeArtists.removedAt)))
    .limit(1);
  if (!existing[0]) return { ok: false, error: "not_found" };

  const [updated] = await db
    .update(djFeeArtists)
    .set({
      ...(patch.feeRange !== undefined ? { feeRange: patch.feeRange } : {}),
      ...(patch.isTenHour !== undefined ? { isTenHour: patch.isTenHour } : {}),
      updatedAt: new Date(),
    })
    .where(eq(djFeeArtists.id, id))
    .returning();

  if (!updated) return { ok: false, error: "not_found" };

  return {
    ok: true,
    artist: {
      id: updated.id,
      name: updated.name,
      feeRange: asRange(updated.feeRange),
      isTenHour: updated.isTenHour,
      source: asSource(updated.source),
    },
  };
}

export async function removeDjFeeArtist(
  id: string,
): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const existing = await db
    .select({ id: djFeeArtists.id })
    .from(djFeeArtists)
    .where(and(eq(djFeeArtists.id, id), isNull(djFeeArtists.removedAt)))
    .limit(1);
  if (!existing[0]) return { ok: false, error: "not_found" };

  await db
    .update(djFeeArtists)
    .set({ removedAt: new Date(), updatedAt: new Date() })
    .where(eq(djFeeArtists.id, id));

  return { ok: true };
}
