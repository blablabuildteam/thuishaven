import { and, desc, eq, or } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { alerts } from "@/lib/db/schema";
import {
  channelToAlertType,
  loadEditionAlertSnapshots,
  matchesForRules,
  type RuleMatch,
} from "@/lib/integrations/alerts/evaluate";
import {
  ensureDefaultAlertRule,
  listEnabledAlertRules,
} from "@/lib/integrations/alerts/rules";
import type {
  SecondaryChannel,
  SecondarySoldOutConflict,
  StoredAlert,
} from "@/lib/integrations/alerts/types";

export type { SecondaryChannel, SecondarySoldOutConflict, StoredAlert };

const TS_ALERT = "ticketswap_after_soldout" as const;
const RA_ALERT = "weeztix_soldout_ra_open" as const;

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
  await ensureDefaultAlertRule().catch(() => null);
  const [snaps, rules] = await Promise.all([
    loadEditionAlertSnapshots().catch(() => []),
    listEnabledAlertRules().catch(() => []),
  ]);
  const matches = matchesForRules(snaps, rules);
  const conflicts = matches.map(
    ({ ruleId: _ruleId, weeztixSold: _sold, ...conflict }) => conflict,
  );
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
    .where(
      or(
        eq(alerts.type, TS_ALERT),
        eq(alerts.type, RA_ALERT),
        eq(alerts.type, "custom"),
      ),
    )
    .orderBy(desc(alerts.createdAt))
    .limit(80);
}

function matchKey(m: RuleMatch): string {
  return `${m.ruleId}:${m.channel}:${m.editionId}`;
}

async function upsertRuleMatches(matches: RuleMatch[]): Promise<number> {
  if (!hasDatabase()) return 0;
  const db = getDb();
  const wanted = new Set(matches.map(matchKey));

  const open = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.isActive, true),
        or(
          eq(alerts.type, TS_ALERT),
          eq(alerts.type, RA_ALERT),
          eq(alerts.type, "custom"),
        ),
      ),
    );

  const channelOf = (type: string): SecondaryChannel =>
    type === RA_ALERT
      ? "resident_advisor"
      : type === TS_ALERT
        ? "ticketswap"
        : "appic";

  for (const row of open) {
    const key =
      row.ruleId && row.editionId
        ? `${row.ruleId}:${channelOf(row.type)}:${row.editionId}`
        : null;
    const orphanStillWanted =
      !row.ruleId &&
      row.editionId &&
      matches.some(
        (m) =>
          m.editionId === row.editionId && m.channel === channelOf(row.type),
      );
    if ((key && wanted.has(key)) || orphanStillWanted) continue;
    await db
      .update(alerts)
      .set({ isActive: false, resolvedAt: new Date() })
      .where(eq(alerts.id, row.id));
  }

  const openKeys = new Set(
    open
      .filter((row) => row.ruleId && row.editionId && row.isActive)
      .map(
        (row) =>
          `${row.ruleId}:${channelOf(row.type)}:${row.editionId}`,
      ),
  );

  for (const match of matches) {
    if (openKeys.has(matchKey(match))) continue;
    const orphan = open.find(
      (row) =>
        row.isActive &&
        !row.ruleId &&
        row.editionId === match.editionId &&
        channelOf(row.type) === match.channel,
    );
    if (orphan) {
      await db
        .update(alerts)
        .set({
          ruleId: match.ruleId,
          title: match.title,
          message: match.message,
        })
        .where(eq(alerts.id, orphan.id));
      continue;
    }
    await db.insert(alerts).values({
      type: channelToAlertType(match.channel),
      ruleId: match.ruleId,
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
}): Promise<{ ra: number; ticketswap: number; appic: number; notified: number }> {
  await ensureDefaultAlertRule().catch(() => null);
  const [snaps, rules] = await Promise.all([
    loadEditionAlertSnapshots().catch(() => []),
    listEnabledAlertRules().catch(() => []),
  ]);
  const matches = matchesForRules(snaps, rules);
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
    notified: notify.sent,
  };
}
