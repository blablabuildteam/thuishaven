import { desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { alertRules } from "@/lib/db/schema";
import {
  gateAlertRecipients,
  parseRecipientInput,
} from "@/lib/integrations/alerts/recipients";
import { DEFAULT_WEEZTIX_SOLD_THRESHOLD } from "@/lib/integrations/weeztix/sold-out";

export type AlertRule = {
  id: string;
  name: string;
  enabled: boolean;
  recipients: string[];
  soldThreshold: number | null;
  checkRa: boolean;
  checkTicketswap: boolean;
  checkAppic: boolean;
  createdByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AlertRuleInput = {
  name: string;
  enabled?: boolean;
  recipients: string[] | string;
  soldThreshold?: number | null;
  checkRa?: boolean;
  checkTicketswap?: boolean;
  checkAppic?: boolean;
};

function toRule(row: typeof alertRules.$inferSelect): AlertRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
    soldThreshold: row.soldThreshold,
    checkRa: row.checkRa,
    checkTicketswap: row.checkTicketswap,
    checkAppic: row.checkAppic,
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function validateAlertRuleInput(input: AlertRuleInput):
  | { ok: true; value: Omit<AlertRule, "id" | "createdAt" | "updatedAt" | "createdByEmail"> }
  | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Naam is verplicht" };

  const gated = gateAlertRecipients(parseRecipientInput(input.recipients));
  if (!gated.ok) return { ok: false, error: gated.error };

  const threshold =
    input.soldThreshold == null || Number.isNaN(input.soldThreshold)
      ? null
      : Math.floor(Number(input.soldThreshold));
  if (threshold != null && threshold <= 0) {
    return { ok: false, error: "Sold-drempel moet leeg of groter dan 0 zijn" };
  }

  const checkRa = input.checkRa !== false;
  const checkTicketswap = input.checkTicketswap !== false;
  const checkAppic = Boolean(input.checkAppic);
  if (!checkRa && !checkTicketswap && !checkAppic) {
    return { ok: false, error: "Kies minstens één kanaal om te checken" };
  }

  return {
    ok: true,
    value: {
      name,
      enabled: input.enabled !== false,
      recipients: gated.to,
      soldThreshold: threshold,
      checkRa,
      checkTicketswap,
      checkAppic,
    },
  };
}

export async function listAlertRules(): Promise<AlertRule[]> {
  if (!hasDatabase()) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(alertRules)
    .orderBy(desc(alertRules.updatedAt));
  return rows.map(toRule);
}

export async function listEnabledAlertRules(): Promise<AlertRule[]> {
  const all = await listAlertRules();
  return all.filter((r) => r.enabled);
}

export async function getAlertRule(id: string): Promise<AlertRule | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.id, id))
    .limit(1);
  return rows[0] ? toRule(rows[0]) : null;
}

export async function createAlertRule(
  input: AlertRuleInput,
  createdByEmail?: string | null,
): Promise<AlertRule> {
  const parsed = validateAlertRuleInput(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const db = getDb();
  const inserted = await db
    .insert(alertRules)
    .values({
      ...parsed.value,
      createdByEmail: createdByEmail ?? null,
    })
    .returning();
  return toRule(inserted[0]);
}

export async function updateAlertRule(
  id: string,
  input: Partial<AlertRuleInput>,
): Promise<AlertRule | null> {
  const existing = await getAlertRule(id);
  if (!existing) return null;
  const parsed = validateAlertRuleInput({
    name: input.name ?? existing.name,
    enabled: input.enabled ?? existing.enabled,
    recipients: input.recipients ?? existing.recipients,
    soldThreshold:
      input.soldThreshold === undefined
        ? existing.soldThreshold
        : input.soldThreshold,
    checkRa: input.checkRa ?? existing.checkRa,
    checkTicketswap: input.checkTicketswap ?? existing.checkTicketswap,
    checkAppic: input.checkAppic ?? existing.checkAppic,
  });
  if (!parsed.ok) throw new Error(parsed.error);
  const db = getDb();
  const updated = await db
    .update(alertRules)
    .set({ ...parsed.value, updatedAt: new Date() })
    .where(eq(alertRules.id, id))
    .returning();
  return updated[0] ? toRule(updated[0]) : null;
}

export async function deleteAlertRule(id: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  const db = getDb();
  const deleted = await db
    .delete(alertRules)
    .where(eq(alertRules.id, id))
    .returning({ id: alertRules.id });
  return deleted.length > 0;
}

/** Eerste bezoek: één regel uit env, zodat bestaande mail-setup niet verdwijnt. */
export async function ensureDefaultAlertRule(): Promise<AlertRule | null> {
  if (!hasDatabase()) return null;
  const existing = await listAlertRules();
  if (existing.length > 0) return existing[0];

  const envRecipients = parseRecipientInput(process.env.ALERT_NOTIFY_EMAIL);
  const gated = gateAlertRecipients(
    envRecipients.length ? envRecipients : ["team@blablabuild.com"],
  );
  if (!gated.ok) return null;

  return createAlertRule({
    name: "Sold-out mismatch",
    enabled: true,
    recipients: gated.to,
    soldThreshold: DEFAULT_WEEZTIX_SOLD_THRESHOLD,
    checkRa: true,
    checkTicketswap: true,
    checkAppic: false,
  });
}
