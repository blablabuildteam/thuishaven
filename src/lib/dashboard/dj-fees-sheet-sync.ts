import { and, desc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";
import { DJ_FEES_FROM_YEAR, djFeesFromDate } from "@/lib/dashboard/dj-fee-ranges";
import {
  parseDjFeeSheetTab,
  type SheetCellValue,
  type SheetFeeRow,
  type SheetSkippedRow,
} from "@/lib/dashboard/dj-fees-sheet-parse";
import { clearTtl } from "@/lib/cache/ttl";
import { getDb } from "@/lib/db/client";
import { djFeeArtists, editions, syncJobs } from "@/lib/db/schema";
import { normalizeArtistKey } from "@/lib/editions/lineup";
import {
  listSheetTabs,
  readSheetTabs,
} from "@/lib/integrations/google-sheets/client";
import { runCron } from "@/lib/system/cron-run";
import { amsterdamDay } from "@/lib/time/amsterdam";

/**
 * Daily sync: client's DJ-fee Google Sheet → dj_fee_artists.
 * The sheet is the source of truth for every DJ it lists; those rows get
 * sheet_synced_at and are read-only in the dashboard. Rows that drop out of
 * the sheet go back to manual (RA / event-name DJs) or are removed (sheet-only).
 */

export const DJ_FEES_SHEET_CRON_SOURCE = "dj-fees-sheet";

export type DjFeeSheetUnmatched = SheetSkippedRow & { day?: string };

export type DjFeeSheetSyncResult = {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  tabs: string[];
  sheetRows: number;
  updated: number;
  inserted: number;
  unchanged: number;
  released: number;
  unmatched: DjFeeSheetUnmatched[];
  /** Dry run only: what would happen per DJ. */
  plan?: Array<{ action: "update" | "insert"; day: string; event: string; name: string }>;
};

export function djFeesSheetId(): string | null {
  return process.env.DJ_FEES_SHEET_ID?.trim() || null;
}

type Edition = { id: string; name: string; day: string };

function isNachtEdition(name: string): boolean {
  return /\bnachtshow\b|\bafterjam\b|\|\s*night\b/i.test(name);
}

function pickEdition(
  row: SheetFeeRow,
  onDay: Edition[],
  keysByEdition: Map<string, Set<string>>,
): Edition | "none" | "ambiguous" {
  if (onDay.length === 0) return "none";
  if (onDay.length === 1) return onDay[0]!;
  const pool = onDay.filter((edition) =>
    row.isAfter ? isNachtEdition(edition.name) : !isNachtEdition(edition.name),
  );
  const candidates = pool.length > 0 ? pool : onDay;
  if (candidates.length === 1) return candidates[0]!;
  const withArtist = candidates.filter((edition) => {
    const have = keysByEdition.get(edition.id);
    return have ? row.keys.some((key) => have.has(key)) : false;
  });
  if (withArtist.length === 1) return withArtist[0]!;
  return "ambiguous";
}

type Group = {
  edition: Edition;
  name: string;
  keys: string[];
  feeAmount: number | null;
  isTenHour: boolean;
  notes: string[];
};

function addToGroup(groups: Map<string, Group>, edition: Edition, row: SheetFeeRow) {
  const stamp = `${edition.id}:${row.keys[0]}`;
  const group = groups.get(stamp);
  if (!group) {
    groups.set(stamp, {
      edition,
      name: row.name,
      keys: [...row.keys],
      feeAmount: row.feeAmount,
      isTenHour: row.isTenHour,
      notes: row.note ? [row.note] : [],
    });
    return;
  }
  // Same DJ twice on one event (e.g. two invoices): add the amounts up.
  if (row.feeAmount != null) group.feeAmount = (group.feeAmount ?? 0) + row.feeAmount;
  group.isTenHour ||= row.isTenHour;
  if (row.note && !group.notes.includes(row.note)) group.notes.push(row.note);
  for (const key of row.keys) if (!group.keys.includes(key)) group.keys.push(key);
}

type ArtistRow = typeof djFeeArtists.$inferSelect;

/** Fee contribution of one sheet DJ to one dashboard row. */
type Contribution = {
  feeAmount: number | null;
  isTenHour: boolean;
  notes: string[];
  /** b2b partner whose fee is booked on the other DJ: €0 unless it has its own row. */
  soft?: boolean;
};

type Target = {
  edition: Edition;
  existing?: ArtistRow;
  /** For inserts. */
  name: string;
  key: string;
  sheetNames: string[];
  parts: Contribution[];
};

const PAIR_SPLIT = /\s+(?:b2b|b3b|vs\.?|x|and|&|\+)\s+|\s*\/\s*/i;

function pairKeys(name: string): string[] {
  const parts = name.split(PAIR_SPLIT).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [];
  return parts
    .map((part) => normalizeArtistKey(part.replace(/\(.*?\)/g, " ")))
    .filter((key) => key.length >= 2);
}

function rowKeys(row: ArtistRow): string[] {
  return [row.nameKey, normalizeArtistKey(row.name.replace(/\(.*?\)/g, " "))];
}

/** Edit distance ≤ 1 ("bartskills" vs "bartskils"); only for longer names. */
function nearlySame(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Map every sheet DJ onto a dashboard row: exact name, a combined RA act
 * ("LILLI & 4LOVE" ← Lilli, 4LOVE), a b2b in the sheet ("Mixolydian b2b
 * SOLIT" → Mixolydian, SOLIT gets €0), a one-letter typo, else a new row.
 */
function planTargets(
  groups: Map<string, Group>,
  artistsByEdition: Map<string, ArtistRow[]>,
): Map<string, Target> {
  const targets = new Map<string, Target>();
  const contribute = (
    edition: Edition,
    row: ArtistRow,
    sheetName: string,
    part: Contribution,
  ) => {
    const target = targets.get(row.id) ?? {
      edition,
      existing: row,
      name: row.name,
      key: row.nameKey,
      sheetNames: [],
      parts: [],
    };
    if (!target.sheetNames.includes(sheetName)) target.sheetNames.push(sheetName);
    target.parts.push(part);
    targets.set(row.id, target);
  };

  for (const group of groups.values()) {
    const rows = artistsByEdition.get(group.edition.id) ?? [];
    const active = rows.filter((row) => !row.removedAt);
    const part: Contribution = {
      feeAmount: group.feeAmount,
      isTenHour: group.isTenHour,
      notes: group.notes,
    };

    const exact =
      active.find((row) => rowKeys(row).some((key) => group.keys.includes(key))) ??
      rows.find((row) => rowKeys(row).some((key) => group.keys.includes(key)));
    if (exact) {
      contribute(group.edition, exact, group.name, part);
      continue;
    }

    const combined = active.find((row) => pairKeys(row.name).includes(group.keys[0]!));
    if (combined) {
      contribute(group.edition, combined, group.name, part);
      continue;
    }

    const partners = pairKeys(group.name)
      .map((key) => active.find((row) => rowKeys(row).includes(key)))
      .filter((row): row is ArtistRow => row != null);
    if (partners.length > 0) {
      const [first, ...rest] = partners;
      contribute(group.edition, first!, group.name, part);
      for (const row of rest) {
        contribute(group.edition, row, group.name, {
          feeAmount: 0,
          isTenHour: group.isTenHour,
          notes: [`b2b — fee staat bij ${first!.name}`],
          soft: true,
        });
      }
      continue;
    }

    const typo = active.find((row) =>
      rowKeys(row).some((key) => group.keys.some((k) => nearlySame(k, key))),
    );
    if (typo) {
      contribute(group.edition, typo, group.name, part);
      continue;
    }

    const stamp = `new:${group.edition.id}:${group.keys[0]}`;
    const target = targets.get(stamp) ?? {
      edition: group.edition,
      name: group.name,
      key: group.keys[0]!,
      sheetNames: [group.name],
      parts: [],
    };
    target.parts.push(part);
    targets.set(stamp, target);
  }
  return targets;
}

function resolveTarget(target: Target): {
  feeAmount: number | null;
  isTenHour: boolean;
  note: string | null;
} {
  const hard = target.parts.filter((part) => !part.soft);
  const used = hard.length > 0 ? hard : target.parts;
  const fees = used.map((part) => part.feeAmount).filter((fee): fee is number => fee != null);
  const notes = [...new Set(used.flatMap((part) => part.notes))];
  if (target.existing && target.sheetNames.length > 1 && hard.length > 1) {
    notes.unshift(`sheet: ${target.sheetNames.join(" + ")}`);
  }
  return {
    feeAmount: fees.length > 0 ? fees.reduce((sum, fee) => sum + fee, 0) : null,
    isTenHour: used.some((part) => part.isTenHour),
    note: notes.length > 0 ? notes.join(" · ").slice(0, 500) : null,
  };
}

async function readSheet(spreadsheetId: string): Promise<DjFeeSheetRead> {
  const allTabs = await listSheetTabs(spreadsheetId);
  const tabs = allTabs.filter(
    (tab) => /^\d{4}$/.test(tab.trim()) && Number(tab.trim()) >= DJ_FEES_FROM_YEAR,
  );
  return parseDjFeeSheetTabs(await readSheetTabs(spreadsheetId, tabs));
}

export type DjFeeSheetRead = {
  tabs: string[];
  rows: SheetFeeRow[];
  skipped: SheetSkippedRow[];
};

/** Parse already-fetched tab values (used by the CLI script for offline tests). */
export function parseDjFeeSheetTabs(values: Map<string, SheetCellValue[][]>): DjFeeSheetRead {
  const tabs = [...values.keys()].filter(
    (tab) => /^\d{4}$/.test(tab.trim()) && Number(tab.trim()) >= DJ_FEES_FROM_YEAR,
  );
  const rows: SheetFeeRow[] = [];
  const skipped: SheetSkippedRow[] = [];
  for (const tab of tabs) {
    const parsed = parseDjFeeSheetTab(tab, values.get(tab) ?? []);
    rows.push(...parsed.rows);
    skipped.push(...parsed.skipped);
  }
  return { tabs, rows, skipped };
}

export async function syncDjFeesFromSheet(
  options: { dryRun?: boolean; sheet?: DjFeeSheetRead } = {},
): Promise<DjFeeSheetSyncResult> {
  const dryRun = options.dryRun ?? false;
  const empty: DjFeeSheetSyncResult = {
    ok: false,
    dryRun,
    tabs: [],
    sheetRows: 0,
    updated: 0,
    inserted: 0,
    unchanged: 0,
    released: 0,
    unmatched: [],
  };

  let sheet = options.sheet;
  if (!sheet) {
    const spreadsheetId = djFeesSheetId();
    if (!spreadsheetId) return { ...empty, error: "DJ_FEES_SHEET_ID ontbreekt" };
    try {
      sheet = await readSheet(spreadsheetId);
    } catch (e) {
      return { ...empty, error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (sheet.rows.length === 0) {
    // Never wipe synced fees because a read came back empty.
    return {
      ...empty,
      tabs: sheet.tabs,
      unmatched: sheet.skipped,
      error:
        sheet.tabs.length === 0
          ? `Geen jaartabbladen vanaf ${DJ_FEES_FROM_YEAR} gevonden`
          : "Sheet bevat geen DJ-regels",
    };
  }

  const db = getDb();
  const editionRows = await db
    .select({ id: editions.id, name: editions.name, startsAt: editions.startsAt })
    .from(editions)
    .where(and(isNotNull(editions.weeztixEventId), gte(editions.startsAt, djFeesFromDate())));
  const byDay = new Map<string, Edition[]>();
  for (const row of editionRows) {
    if (/TEMPLATE/i.test(row.name)) continue;
    const edition = { id: row.id, name: row.name, day: amsterdamDay(row.startsAt) };
    const list = byDay.get(edition.day) ?? [];
    list.push(edition);
    byDay.set(edition.day, list);
  }
  const editionIds = editionRows.map((row) => row.id);

  const artistRows =
    editionIds.length === 0
      ? []
      : await db
          .select()
          .from(djFeeArtists)
          .where(
            or(
              inArray(djFeeArtists.editionId, editionIds),
              isNotNull(djFeeArtists.sheetSyncedAt),
            ),
          );

  const artistsByEdition = new Map<string, typeof artistRows>();
  const keysByEdition = new Map<string, Set<string>>();
  for (const row of artistRows) {
    const list = artistsByEdition.get(row.editionId) ?? [];
    list.push(row);
    artistsByEdition.set(row.editionId, list);
    if (row.removedAt) continue;
    const have = keysByEdition.get(row.editionId) ?? new Set<string>();
    have.add(row.nameKey);
    have.add(normalizeArtistKey(row.name.replace(/\(.*?\)/g, " ")));
    keysByEdition.set(row.editionId, have);
  }

  const unmatched: DjFeeSheetUnmatched[] = [...sheet.skipped];
  const groups = new Map<string, Group>();
  for (const row of sheet.rows) {
    const picked = pickEdition(row, byDay.get(row.day) ?? [], keysByEdition);
    if (picked === "none" || picked === "ambiguous") {
      unmatched.push({
        tab: row.tab,
        row: row.row,
        name: row.name,
        day: row.day,
        reason:
          picked === "none"
            ? "Geen event op deze datum"
            : "Meerdere events op deze datum — zet 'after' bij Bijzonderheid voor de nachtshow",
      });
      continue;
    }
    addToGroup(groups, picked, row);
  }

  const now = new Date();
  const plan: NonNullable<DjFeeSheetSyncResult["plan"]> = [];
  const targets = planTargets(groups, artistsByEdition);
  const touched = new Set<string>();
  let updated = 0;
  let inserted = 0;
  let unchanged = 0;

  for (const target of targets.values()) {
    const { feeAmount, isTenHour, note } = resolveTarget(target);
    const existing = target.existing;

    if (existing) {
      touched.add(existing.id);
      const same =
        existing.feeAmount === feeAmount &&
        existing.isTenHour === isTenHour &&
        existing.sheetNote === note &&
        existing.removedAt == null &&
        existing.sheetSyncedAt != null &&
        (feeAmount == null || existing.feeRange == null);
      if (same) {
        unchanged += 1;
        continue;
      }
      updated += 1;
      if (dryRun) {
        plan.push({
          action: "update",
          day: target.edition.day,
          event: target.edition.name,
          name: `${target.sheetNames.join(" + ")} → ${existing.name}`,
        });
        continue;
      }
      await db
        .update(djFeeArtists)
        .set({
          feeAmount,
          ...(feeAmount != null ? { feeRange: null } : {}),
          isTenHour,
          sheetNote: note,
          sheetSyncedAt: now,
          removedAt: null,
          updatedAt: now,
        })
        .where(eq(djFeeArtists.id, existing.id));
      continue;
    }

    inserted += 1;
    if (dryRun) {
      plan.push({
        action: "insert",
        day: target.edition.day,
        event: target.edition.name,
        name: target.name,
      });
      continue;
    }
    const list = artistsByEdition.get(target.edition.id) ?? [];
    const sortOrder = Math.max(-1, ...list.map((a) => a.sortOrder)) + 1;
    const [created] = await db
      .insert(djFeeArtists)
      .values({
        editionId: target.edition.id,
        name: target.name,
        nameKey: target.key,
        feeAmount,
        isTenHour,
        source: "sheet",
        sortOrder,
        sheetNote: note,
        sheetSyncedAt: now,
      })
      .onConflictDoNothing({ target: [djFeeArtists.editionId, djFeeArtists.nameKey] })
      .returning();
    if (created) {
      touched.add(created.id);
      list.push(created);
      artistsByEdition.set(target.edition.id, list);
    }
  }

  // DJs that are no longer in the sheet: hand them back to manual entry.
  const stale = artistRows.filter(
    (row) => row.sheetSyncedAt != null && !touched.has(row.id),
  );
  if (!dryRun) {
    for (const row of stale) {
      await db
        .update(djFeeArtists)
        .set(
          row.source === "sheet"
            ? { removedAt: now, sheetSyncedAt: null, sheetNote: null, updatedAt: now }
            : { feeAmount: null, sheetSyncedAt: null, sheetNote: null, updatedAt: now },
        )
        .where(eq(djFeeArtists.id, row.id));
    }
  }

  return {
    ok: true,
    dryRun,
    tabs: sheet.tabs,
    sheetRows: sheet.rows.length,
    updated,
    inserted,
    unchanged,
    released: stale.length,
    ...(dryRun ? { plan } : {}),
    unmatched: unmatched.sort((a, b) =>
      a.tab === b.tab ? a.row - b.row : a.tab.localeCompare(b.tab),
    ),
  };
}

/** Run the sync and record it in sync_jobs (cron + "Sync nu" button). */
export async function runDjFeesSheetSync(trigger: "cron" | "manual") {
  const run = await runCron(DJ_FEES_SHEET_CRON_SOURCE, () => syncDjFeesFromSheet(), {
    logFailure: true,
    outcome: (result) => ({
      status: result.ok ? "ok" : "failed",
      error: result.error ?? null,
      meta: {
        trigger,
        tabs: result.tabs,
        sheetRows: result.sheetRows,
        updated: result.updated,
        inserted: result.inserted,
        unchanged: result.unchanged,
        released: result.released,
        unmatched: result.unmatched.slice(0, 200),
      },
    }),
  });
  // The board is cached per instance; show synced fees right away.
  clearTtl("dj-fee-board");
  return run;
}

export type DjFeesSheetStatus = {
  configured: boolean;
  /** Link to open the client's sheet. */
  sheetUrl: string | null;
  lastRunAt: string | null;
  lastStatus: "ok" | "partial" | "failed" | "running" | null;
  lastError: string | null;
  sheetRows: number | null;
  unmatched: DjFeeSheetUnmatched[];
};

export async function loadDjFeesSheetStatus(): Promise<DjFeesSheetStatus> {
  const sheetId = djFeesSheetId();
  const configured = Boolean(sheetId);
  const sheetUrl = sheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit`
    : null;
  const [last] = await getDb()
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.source, DJ_FEES_SHEET_CRON_SOURCE))
    .orderBy(desc(syncJobs.startedAt))
    .limit(1);
  if (!last) {
    return {
      configured,
      sheetUrl,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      sheetRows: null,
      unmatched: [],
    };
  }
  const meta = (last.meta ?? {}) as {
    sheetRows?: number;
    unmatched?: DjFeeSheetUnmatched[];
  };
  return {
    configured,
    sheetUrl,
    lastRunAt: (last.finishedAt ?? last.startedAt)?.toISOString() ?? null,
    lastStatus: last.status as DjFeesSheetStatus["lastStatus"],
    lastError: last.error,
    sheetRows: meta.sheetRows ?? null,
    unmatched: Array.isArray(meta.unmatched) ? meta.unmatched : [],
  };
}
