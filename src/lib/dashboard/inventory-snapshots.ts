/** Cumulative Weeztix stand → tickets sold between consecutive snapshots. */

export type InventorySnapshotRow = {
  editionId: string;
  day: string;
  sold: number;
  paidSold?: number;
  freeSold?: number;
  revenueCents?: number;
};

export type InventoryDayDelta = {
  editionId: string;
  day: string;
  sold: number;
  paidSold: number;
  freeSold: number;
  revenueCents: number;
};

export function normalizeIsoDay(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/**
 * First snapshot per edition is the baseline (no sales attributed).
 * Each later snapshot becomes that day's sold = max(0, current − previous).
 * A missed day folds into the next snapshot we have.
 */
export function dailyDeltasFromInventorySnapshots(
  rows: InventorySnapshotRow[],
): InventoryDayDelta[] {
  const byEdition = new Map<string, InventorySnapshotRow[]>();
  for (const row of rows) {
    const day = normalizeIsoDay(row.day);
    if (!day) continue;
    const list = byEdition.get(row.editionId) ?? [];
    list.push({ ...row, day });
    byEdition.set(row.editionId, list);
  }

  const out: InventoryDayDelta[] = [];
  for (const [editionId, list] of byEdition) {
    const unique: InventorySnapshotRow[] = [];
    for (const row of [...list].sort((a, b) => a.day.localeCompare(b.day))) {
      const last = unique[unique.length - 1];
      if (last && last.day === row.day) unique[unique.length - 1] = row;
      else unique.push(row);
    }
    for (let i = 1; i < unique.length; i += 1) {
      const prev = unique[i - 1]!;
      const curr = unique[i]!;
      const sold = Math.max(0, curr.sold - prev.sold);
      const paidSold = Math.max(0, (curr.paidSold ?? 0) - (prev.paidSold ?? 0));
      const freeSold = Math.max(0, (curr.freeSold ?? 0) - (prev.freeSold ?? 0));
      const revenueCents = Math.max(
        0,
        (curr.revenueCents ?? 0) - (prev.revenueCents ?? 0),
      );
      if (sold <= 0 && paidSold <= 0 && revenueCents <= 0) continue;
      out.push({
        editionId,
        day: curr.day,
        sold,
        paidSold,
        freeSold,
        revenueCents,
      });
    }
  }
  return out;
}

export function firstSnapshotDay(
  rows: InventorySnapshotRow[],
  editionId: string,
): string | null {
  let first: string | null = null;
  for (const row of rows) {
    if (row.editionId !== editionId) continue;
    const day = normalizeIsoDay(row.day);
    if (!day) continue;
    if (!first || day < first) first = day;
  }
  return first;
}
