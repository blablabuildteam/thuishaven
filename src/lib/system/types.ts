/** Client-safe types for system health (no server imports here). */

export type HealthSeverity = "ok" | "degraded" | "down";

export type HealthIssueKind =
  | "auth" // credentials rejected / probe error
  | "sync_failed" // last cron run failed or crashed
  | "sync_partial" // last run succeeded only partly
  | "stale" // no successful run for longer than the schedule allows
  | "token_expiring"
  | "token_expired";

export type MonitorHealth = {
  id: string;
  label: string;
  severity: HealthSeverity;
  kind: HealthIssueKind | null;
  /** Plain-language line for everyone ("Ticketcijfers kunnen verouderd zijn"). */
  impact: string;
  /** Technical detail + what to do. Only sent to admins. */
  detail?: string;
  action?: string;
  /** Pages that show data from this monitor. */
  pages: string[];
  lastSuccessAt: string | null;
  lastRunAt: string | null;
};

export type SystemHealth = {
  checkedAt: string;
  severity: HealthSeverity;
  /** Only monitors with a problem. */
  issues: MonitorHealth[];
  /** Every monitor with a run history, for "data as of" labels. */
  freshness: Record<string, { label: string; lastSuccessAt: string | null }>;
};
