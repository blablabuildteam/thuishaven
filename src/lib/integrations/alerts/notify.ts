import { and, eq, isNull, or } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { alerts } from "@/lib/db/schema";
import {
  alertSender,
  sendBrevoTransactionalEmail,
} from "@/lib/integrations/brevo/client";
import {
  renderMismatchAlertEmail,
  renderTestAlertEmail,
  type AlertEmailItem,
} from "@/lib/integrations/alerts/email";
import { resolveAlertRecipients } from "@/lib/integrations/alerts/recipients";
import { getAlertRule } from "@/lib/integrations/alerts/rules";

const TS_ALERT = "ticketswap_after_soldout" as const;
const RA_ALERT = "weeztix_soldout_ra_open" as const;

function toEmailItem(alert: {
  type: string;
  title: string;
  message: string;
}): AlertEmailItem {
  if (alert.type === RA_ALERT) {
    return {
      channel: "Resident Advisor",
      kind: "overbooking",
      title: alert.title,
      message: alert.message,
    };
  }
  if (alert.type === "custom") {
    return {
      channel: "Appic",
      kind: "revenue_leak",
      title: alert.title,
      message: alert.message,
    };
  }
  return {
    channel: "TicketSwap",
    kind: "revenue_leak",
    title: alert.title,
    message: alert.message,
  };
}

async function sendGatedAlertMail(input: {
  subject: string;
  html: string;
  text: string;
  recipients?: string[];
}): Promise<{ ok: true; to: string[] } | { ok: false; error: string }> {
  const resolved = resolveAlertRecipients(input.recipients);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  const result = await sendBrevoTransactionalEmail({
    to: resolved.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    sender: alertSender(),
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, to: resolved.to };
}

/** Stuur mail voor actieve alerts die nog niet genotificeerd zijn. */
export async function notifyUnsentDashboardAlerts(): Promise<{
  sent: number;
  skipped: string | null;
  error: string | null;
}> {
  if (!hasDatabase()) {
    return { sent: 0, skipped: "Geen database", error: null };
  }

  const db = getDb();
  const pending = await db
    .select({
      id: alerts.id,
      type: alerts.type,
      ruleId: alerts.ruleId,
      title: alerts.title,
      message: alerts.message,
    })
    .from(alerts)
    .where(
      and(
        eq(alerts.isActive, true),
        isNull(alerts.notifiedAt),
        or(
          eq(alerts.type, TS_ALERT),
          eq(alerts.type, RA_ALERT),
          eq(alerts.type, "custom"),
        ),
      ),
    );

  if (pending.length === 0) {
    return { sent: 0, skipped: "Geen nieuwe alerts", error: null };
  }

  const byRecipients = new Map<string, typeof pending>();
  const recipientLists = new Map<string, string[] | undefined>();

  for (const row of pending) {
    let recipients: string[] | undefined;
    if (row.ruleId) {
      const rule = await getAlertRule(row.ruleId);
      recipients = rule?.recipients;
    }
    const key = (recipients ?? []).join(",") || "__env__";
    recipientLists.set(key, recipients);
    const group = byRecipients.get(key) ?? [];
    group.push(row);
    byRecipients.set(key, group);
  }

  let sent = 0;
  let lastError: string | null = null;

  for (const [key, group] of byRecipients) {
    const recipients = recipientLists.get(key);
    const gate = resolveAlertRecipients(recipients);
    if (!gate.ok) {
      lastError = gate.error;
      continue;
    }

    const subject =
      group.length === 1
        ? `[Thuishaven] Alert: ${group[0].title}`
        : `[Thuishaven] ${group.length} sold-out alerts`;
    const { html, text } = renderMismatchAlertEmail(group.map(toEmailItem));
    const result = await sendGatedAlertMail({
      subject,
      html,
      text,
      recipients,
    });
    if (!result.ok) {
      lastError = result.error;
      continue;
    }

    const now = new Date();
    for (const row of group) {
      await db
        .update(alerts)
        .set({ notifiedAt: now })
        .where(eq(alerts.id, row.id));
    }
    sent += group.length;
  }

  if (sent === 0) {
    return { sent: 0, skipped: lastError, error: lastError };
  }
  return { sent, skipped: null, error: lastError };
}

export async function sendAlertTestEmail(recipients?: string[]): Promise<
  { ok: true; to: string[] } | { ok: false; error: string }
> {
  const { html, text } = renderTestAlertEmail();
  return sendGatedAlertMail({
    subject: "[Thuishaven] Test: sold-out alert mail",
    html,
    text,
    recipients,
  });
}
