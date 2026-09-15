import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { alerts } from "@/lib/db/schema";
import {
  channelToAlertType,
  evaluateAlertRules,
  findPlatformTakedowns,
  groupPlatformTakedowns,
  loadEditionAlertSnapshots,
  loadWeatherAlertSnapshots,
  type EvaluatedAlertMatch,
  type GroupedPlatformTakedown,
} from "@/lib/integrations/alerts/evaluate";
import {
  listEnabledAlertRules,
} from "@/lib/integrations/alerts/rules";
import type {
  DashboardAlertType,
  SecondaryChannel,
  SecondarySoldOutConflict,
  StoredAlert,
  TakedownChannel,
} from "@/lib/integrations/alerts/types";
import { DASHBOARD_ALERT_TYPES } from "@/lib/integrations/alerts/types";
import { refreshUpcomingEditionForecast } from "@/lib/weather/store";

export type {
  SecondaryChannel,
  SecondarySoldOutConflict,
  StoredAlert,
  TakedownChannel,
};
export type { GroupedPlatformTakedown };

export type TicketswapSoldOutAlert = {
  editionId: string;
  editionName: string;
  startsAt: Date;
  availableCount: number | null;
  tsUrl: string | null;
  tsTitle: string | null;
};

export type AppicSoldOutAlert = {
  editionId: string;
  editionName: string;
  startsAt: Date;
  availableCount: number | null;
};

export async function listOpenDashboardAlerts(): Promise<{
  ra: Array<{ editionId: string }>;
  ticketswap: TicketswapSoldOutAlert[];
  appic: AppicSoldOutAlert[];
  conflicts: SecondarySoldOutConflict[];
}> {
  const [snaps, rules] = await Promise.all([
    loadEditionAlertSnapshots().catch(() => []),
    listEnabledAlertRules().catch(() => []),
  ]);
  const matches = mergeAlertMatches(snaps, [], rules).filter(
    (m): m is EvaluatedAlertMatch & { channel: SecondaryChannel } =>
      m.channel != null,
  );
  const conflicts: SecondarySoldOutConflict[] = matches.map((m) => ({
    editionId: m.editionId,
    editionName: m.editionName,
    startsAt: m.startsAt,
    channel: m.channel,
    channelLabel:
      m.channel === "resident_advisor"
        ? "Resident Advisor"
        : m.channel === "ticketswap"
          ? "TicketSwap"
          : "Appic Game",
    kind: m.channel === "resident_advisor" ? "overbooking" : "revenue_leak",
    title: m.title,
    message: m.message,
    availableCount: null,
    url: null,
  }));
  conflicts.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return {
    ra: conflicts
      .filter((c) => c.channel === "resident_advisor")
      .map((c) => ({ editionId: c.editionId })),
    ticketswap: conflicts
      .filter((c) => c.channel === "ticketswap")
      .map((c) => ({
        editionId: c.editionId,
        editionName: c.editionName,
        startsAt: c.startsAt,
        availableCount: c.availableCount,
        tsUrl: c.url,
        tsTitle: null,
      })),
    appic: conflicts
      .filter((c) => c.channel === "appic")
      .map((c) => ({
        editionId: c.editionId,
        editionName: c.editionName,
        startsAt: c.startsAt,
        availableCount: c.availableCount,
      })),
    conflicts,
  };
}

export async function listStoredDashboardAlerts(): Promise<StoredAlert[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  return db
    .select({
      id: alerts.id,
      type: alerts.type,
      ruleId: alerts.ruleId,
      editionId: alerts.editionId,
      title: alerts.title,
      message: alerts.message,
      isActive: alerts.isActive,
      createdAt: alerts.createdAt,
      notifiedAt: alerts.notifiedAt,
      resolvedAt: alerts.resolvedAt,
    })
    .from(alerts)
    .where(inArray(alerts.type, DASHBOARD_ALERT_TYPES))
    .orderBy(desc(alerts.createdAt))
    .limit(80);
}

export async function listUpcomingPlatformTakedowns(): Promise<
  GroupedPlatformTakedown[]
> {
  const snaps = await loadEditionAlertSnapshots().catch(() => []);
  return groupPlatformTakedowns(findPlatformTakedowns(snaps));
}

export async function upcomingPlatformTakedownStatus(): Promise<{
  takedowns: GroupedPlatformTakedown[];
  upcomingEditionCount: number;
}> {
  const snaps = await loadEditionAlertSnapshots().catch(() => []);
  return {
    takedowns: groupPlatformTakedowns(findPlatformTakedowns(snaps)),
    upcomingEditionCount: snaps.length,
  };
}

function matchKey(m: EvaluatedAlertMatch): string {
  return `${m.ruleId}:${m.type}:${m.editionId}`;
}

function rowKey(row: {
  ruleId: string | null;
  type: string;
  editionId: string | null;
}): string | null {
  if (!row.editionId) return null;
  return `${row.ruleId ?? ""}:${row.type}:${row.editionId}`;
}

function mergeAlertMatches(
  snaps: Awaited<ReturnType<typeof loadEditionAlertSnapshots>>,
  weatherSnaps: Awaited<ReturnType<typeof loadWeatherAlertSnapshots>>,
  rules: Awaited<ReturnType<typeof listEnabledAlertRules>>,
): EvaluatedAlertMatch[] {
  const ruleMatches = evaluateAlertRules({ snaps, weatherSnaps, rules });
  const mismatchRuleId =
    rules.find((r) => r.kind === "soldout_mismatch")?.id ?? "";
  const platform = findPlatformTakedowns(snaps).map((match) => ({
    ruleId: mismatchRuleId,
    editionId: match.editionId,
    editionName: match.editionName,
    startsAt: match.startsAt,
    type: channelToAlertType(match.channel) as DashboardAlertType,
    title: match.title,
    message: match.message,
    channel: match.channel as SecondaryChannel,
    weeztixSold: match.weeztixSold,
  }));

  const seen = new Set<string>();
  const out: EvaluatedAlertMatch[] = [];
  for (const match of [...ruleMatches, ...platform]) {
    const key = match.channel
      ? `${match.channel}:${match.editionId}`
      : matchKey(match);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}

async function upsertRuleMatches(matches: EvaluatedAlertMatch[]): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const wanted = new Set(matches.map(matchKey));
  const wantedOrphans = new Set(
    matches.map((m) => `:${m.type}:${m.editionId}`),
  );

  const open = await db
    .select()
    .from(alerts)
    .where(
      and(eq(alerts.isActive, true), inArray(alerts.type, DASHBOARD_ALERT_TYPES)),
    );

  for (const row of open) {
    const key = rowKey(row);
    const stillWanted =
      (key && wanted.has(key)) ||
      (row.editionId != null &&
        wantedOrphans.has(`:${row.type}:${row.editionId}`) &&
        !row.ruleId);
    if (stillWanted) continue;
    await db
      .update(alerts)
      .set({ isActive: false, resolvedAt: new Date() })
      .where(eq(alerts.id, row.id));
  }

  const openKeys = new Set(
    open
      .filter((row) => row.isActive && row.editionId)
      .map((row) => rowKey(row))
      .filter((key): key is string => Boolean(key)),
  );

  for (const match of matches) {
    if (openKeys.has(matchKey(match))) continue;
    const orphan = open.find(
      (row) =>
        row.isActive &&
        !row.ruleId &&
        row.editionId === match.editionId &&
        row.type === match.type,
    );
    if (orphan) {
      await db
        .update(alerts)
        .set({
          ruleId: match.ruleId || null,
          title: match.title,
          message: match.message,
        })
        .where(eq(alerts.id, orphan.id));
      continue;
    }
    await db.insert(alerts).values({
      type: match.type,
      ruleId: match.ruleId || null,
      isActive: true,
      editionId: match.editionId,
      title: match.title,
      message: match.message,
    });
  }

  return matches.length;
}

export async function refreshDashboardAlerts(_options?: {
  ticketswapLive?: boolean;
}): Promise<{
  ra: number;
  ticketswap: number;
  appic: number;
  sales: number;
  weather: number;
  notified: number;
}> {
  await refreshUpcomingEditionForecast().catch(() => null);
  const [snaps, weatherSnaps, rules] = await Promise.all([
    loadEditionAlertSnapshots().catch(() => []),
    loadWeatherAlertSnapshots().catch(() => []),
    listEnabledAlertRules().catch(() => []),
  ]);
  const matches = mergeAlertMatches(snaps, weatherSnaps, rules);
  await upsertRuleMatches(matches).catch(() => 0);

  const { notifyUnsentDashboardAlerts } = await import(
    "@/lib/integrations/alerts/notify"
  );
  const notify = await notifyUnsentDashboardAlerts().catch((e) => ({
    sent: 0,
    skipped: null,
    error: e instanceof Error ? e.message : "notify failed",
  }));

  return {
    ra: matches.filter((m) => m.channel === "resident_advisor").length,
    ticketswap: matches.filter((m) => m.channel === "ticketswap").length,
    appic: matches.filter((m) => m.channel === "appic").length,
    sales: matches.filter((m) => m.type === "sales_threshold").length,
    weather: matches.filter((m) => m.type === "weather").length,
    notified: notify.sent,
  };
}
