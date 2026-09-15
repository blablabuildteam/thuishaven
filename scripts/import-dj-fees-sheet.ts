/**
 * Prefill DJ-fees from the Google Sheets TSV export.
 *
 * Usage:
 *   npx tsx scripts/import-dj-fees-sheet.ts [path-to.tsv]
 */

import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, gte, isNotNull } from "drizzle-orm";
import { djFeesFromDate, type DjFeeRangeId } from "../src/lib/dashboard/dj-fee-ranges";
import { endDb, getDb } from "../src/lib/db/client";
import { djFeeArtists, editions } from "../src/lib/db/schema";
import { normalizeArtistKey } from "../src/lib/editions/lineup";
import { amsterdamDay } from "../src/lib/time/amsterdam";

const DEFAULT_TSV =
  "/Users/xennith/Downloads/Thuishaven - DJ Fee Spend Overview - Sheet1.tsv";

type SheetRow = {
  day: string;
  nacht: boolean;
  name: string;
  feeRange: DjFeeRangeId;
  isTenHour: boolean;
};

function parseDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const day = m[1]!.padStart(2, "0");
  const month = m[2]!.padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

function parsePrice(raw: string): DjFeeRangeId | null {
  const compact = raw
    .replace(/[€.\s]/g, "")
    .replace(/[–—−]/g, "-")
    .trim();
  switch (compact) {
    case "0-600":
      return "0_600";
    case "600-1000":
      return "600_1000";
    case "1000-2500":
      return "1000_2500";
    case "2500-5000":
      return "2500_5000";
    case "5000-10000":
      return "5000_10000";
    case "10000+":
      return "10000_plus";
    default:
      return null;
  }
}

function parseTenHour(raw: string, remarks: string, fallback: boolean | null) {
  if (/geen\s*10\s*hrs/i.test(remarks)) return false;
  const v = raw.trim().toLowerCase();
  if (v === "ja" || v === "yes") return true;
  if (v === "nee" || v === "no") return false;
  return fallback;
}

function cleanName(raw: string): string {
  return raw
    .replace(/\b10\s*hrs?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKeys(name: string): string[] {
  const keys = new Set<string>();
  const add = (value: string) => {
    const key = normalizeArtistKey(value);
    if (key.length >= 2) keys.add(key);
  };
  add(name);
  add(name.replace(/\(.*?\)/g, " "));
  const paren = name.match(/\(([^)]+)\)/);
  if (paren?.[1]) add(paren[1]);
  return [...keys];
}

function parseTsv(text: string): SheetRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: SheetRow[] = [];
  let currentDay: string | null = null;
  let currentNacht = false;
  let currentTenHour: boolean | null = null;

  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    const dateRaw = (cols[0] ?? "").trim();
    const dayPart = (cols[1] ?? "").trim();
    const name = cleanName(cols[2] ?? "");
    const price = parsePrice(cols[3] ?? "");
    const remarks = (cols[5] ?? "").trim();

    if (dateRaw) {
      const parsed = parseDate(dateRaw);
      if (parsed) {
        currentDay = parsed;
        currentNacht = /nacht/i.test(dayPart);
        currentTenHour = null;
      }
    }
    if (!currentDay || !name || !price) continue;

    currentTenHour = parseTenHour(cols[4] ?? "", remarks, currentTenHour);
    rows.push({
      day: currentDay,
      nacht: currentNacht,
      name,
      feeRange: price,
      isTenHour: currentTenHour ?? false,
    });
  }
  return rows;
}

function isNachtEdition(name: string) {
  return /\bnachtshow\b|\bafterjam\b|\|\s*night\b/i.test(name);
}

function closest<T extends { day: string }>(
  list: T[],
  day: string,
): T | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0]!;
  const target = Date.parse(`${day}T12:00:00`);
  return list.slice().sort((a, b) => {
    const da = Math.abs(Date.parse(`${a.day}T12:00:00`) - target);
    const db = Math.abs(Date.parse(`${b.day}T12:00:00`) - target);
    return da - db;
  })[0]!;
}

function pickEdition(
  row: SheetRow,
  byDay: Map<string, Array<{ id: string; name: string; day: string }>>,
  all: Array<{ id: string; name: string; day: string }>,
  artistByEdition: Map<string, Set<string>>,
): { id: string; name: string; day: string } | null {
  const keys = nameKeys(row.name);
  const onDay = byDay.get(row.day) ?? [];
  const pool = onDay.filter((edition) =>
    row.nacht ? isNachtEdition(edition.name) : !isNachtEdition(edition.name),
  );
  const candidates = pool.length > 0 ? pool : onDay;

  const withArtist = candidates.filter((edition) => {
    const have = artistByEdition.get(edition.id);
    if (!have) return false;
    return keys.some((key) => have.has(key));
  });
  const onDayMatch = withArtist[0] ?? candidates[0];
  if (onDayMatch) return onDayMatch;

  const elsewhere = all.filter((edition) => {
    const have = artistByEdition.get(edition.id);
    if (!have) return false;
    return keys.some((key) => have.has(key));
  });
  const named = all.filter((edition) =>
    keys.some((key) => normalizeArtistKey(edition.name).includes(key)),
  );
  return closest(elsewhere, row.day) ?? closest(named, row.day);
}

async function main() {
  const path = process.argv[2] ?? DEFAULT_TSV;
  const sheet = parseTsv(readFileSync(path, "utf8"));
  const db = getDb();

  const editionRows = await db
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
    );

  const editionsView = editionRows
    .filter((row) => !/TEMPLATE/i.test(row.name))
    .map((row) => ({
      id: row.id,
      name: row.name,
      day: amsterdamDay(row.startsAt),
    }));

  const byDay = new Map<string, typeof editionsView>();
  for (const row of editionsView) {
    const list = byDay.get(row.day) ?? [];
    list.push(row);
    byDay.set(row.day, list);
  }

  const artistRows = await db
    .select({
      id: djFeeArtists.id,
      editionId: djFeeArtists.editionId,
      name: djFeeArtists.name,
      nameKey: djFeeArtists.nameKey,
      source: djFeeArtists.source,
      sortOrder: djFeeArtists.sortOrder,
      removedAt: djFeeArtists.removedAt,
    })
    .from(djFeeArtists);

  const artistByEdition = new Map<string, Set<string>>();
  const artists = new Map<
    string,
    Array<(typeof artistRows)[number]>
  >();
  for (const row of artistRows) {
    const list = artists.get(row.editionId) ?? [];
    list.push(row);
    artists.set(row.editionId, list);
    if (row.removedAt) continue;
    const have = artistByEdition.get(row.editionId) ?? new Set();
    have.add(row.nameKey);
    for (const key of nameKeys(row.name)) have.add(key);
    artistByEdition.set(row.editionId, have);
  }

  const now = new Date();
  await db.update(djFeeArtists).set({ isTenHour: false, updatedAt: now });
  let updated = 0;
  let inserted = 0;
  let unmatched = 0;
  const unmatchedRows: string[] = [];

  for (const row of sheet) {
    const edition = pickEdition(row, byDay, editionsView, artistByEdition);
    if (!edition) {
      unmatched += 1;
      unmatchedRows.push(`${row.day} ${row.nacht ? "nacht" : "dag"} ${row.name}`);
      continue;
    }

    const existing = (artists.get(edition.id) ?? []).find((artist) => {
      if (artist.removedAt) return false;
      const have = new Set([artist.nameKey, ...nameKeys(artist.name)]);
      return nameKeys(row.name).some((key) => have.has(key));
    });

    if (existing) {
      await db
        .update(djFeeArtists)
        .set({
          feeRange: row.feeRange,
          isTenHour: row.isTenHour,
          removedAt: null,
          updatedAt: now,
        })
        .where(eq(djFeeArtists.id, existing.id));
      updated += 1;
      continue;
    }

    const removed = (artists.get(edition.id) ?? []).find((artist) => {
      if (!artist.removedAt) return false;
      const have = new Set([artist.nameKey, ...nameKeys(artist.name)]);
      return nameKeys(row.name).some((key) => have.has(key));
    });
    if (removed) {
      await db
        .update(djFeeArtists)
        .set({
          feeRange: row.feeRange,
          isTenHour: row.isTenHour,
          removedAt: null,
          source: "custom",
          updatedAt: now,
        })
        .where(eq(djFeeArtists.id, removed.id));
      updated += 1;
      continue;
    }

    const nameKey = normalizeArtistKey(row.name.replace(/\(.*?\)/g, " "));
    const sortOrder =
      Math.max(0, ...(artists.get(edition.id) ?? []).map((a) => a.sortOrder)) +
      1;
    const [created] = await db
      .insert(djFeeArtists)
      .values({
        editionId: edition.id,
        name: row.name.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim(),
        nameKey: nameKey || normalizeArtistKey(row.name),
        feeRange: row.feeRange,
        isTenHour: row.isTenHour,
        source: "custom",
        sortOrder,
      })
      .returning();
    if (created) {
      const list = artists.get(edition.id) ?? [];
      list.push({ ...created, removedAt: null });
      artists.set(edition.id, list);
      const have = artistByEdition.get(edition.id) ?? new Set();
      have.add(created.nameKey);
      for (const key of nameKeys(created.name)) have.add(key);
      artistByEdition.set(edition.id, have);
      inserted += 1;
    }
  }

  console.log(
    JSON.stringify(
      { sheet: sheet.length, updated, inserted, unmatched, unmatchedRows },
      null,
      2,
    ),
  );
  await endDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
