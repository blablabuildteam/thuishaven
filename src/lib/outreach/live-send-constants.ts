/** Shared client+server constants for live send confirm / caps. */

/** Confirm phrase that always works (besides exact bakjenaam). */
export const LIVE_SEND_CONFIRM_PHRASE = "VERSTUUR LIVE";

/** Default hard daily cap if cadence/env missing. */
export const DEFAULT_LIVE_DAILY_CAP = 3;

/** Pause live send after this many bounces in the last 24h. */
export const BOUNCE_PAUSE_THRESHOLD = 3;

/**
 * Planned mails older than this are never auto-sent (e.g. when live send is
 * switched on after their slot passed). They must be re-planned.
 */
export const OVERDUE_GRACE_MS = 2 * 60 * 60 * 1000;
