/** Shared social sync depth — keep at least this much history in marketing_posts. */
export const SOCIAL_SYNC_LOOKBACK_MONTHS = 6;

/** Hard cap so a runaway account cannot blow API quota. */
export const SOCIAL_SYNC_MAX_ITEMS = 500;

/** Start of the lookback window (local calendar months). */
export function socialSyncSince(now: Date = new Date()): Date {
  const since = new Date(now.getTime());
  since.setMonth(since.getMonth() - SOCIAL_SYNC_LOOKBACK_MONTHS);
  return since;
}
