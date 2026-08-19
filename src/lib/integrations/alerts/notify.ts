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
  return {
    channel: "TicketSwap",
    kind: "revenue_leak",
    title: alert.title,
    message: alert.message,
  };
}

/**
 * Enige verstuurpad voor alerts.
 * Ontvangers komen NOOIT uit argumenten — alleen uit resolveAlertRecipients().
 */
async function sendGatedAlertMail(input: {
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true; to: string[] } | { ok: false; error: string }> {
  const resolved = resolveAlertRecipients();
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
  const gate = resolveAlertRecipients();
  if (!gate.ok) {
    return { sent: 0, skipped: gate.error, error: null };
  }
  if (!hasDatabase()) {
    return { sent: 0, skipped: "Geen database", error: null };
  }

  const db = getDb();
  const pending = await db
    .select({
      id: alerts.id,
      type: alerts.type,
      title: alerts.title,
      message: alerts.message,
    })
    .from(alerts)
    .where(
      and(
        eq(alerts.isActive, true),
        isNull(alerts.notifiedAt),
        or(eq(alerts.type, TS_ALERT), eq(alerts.type, RA_ALERT)),
      ),
    );

  if (pending.length === 0) {
    return { sent: 0, skipped: "Geen nieuwe alerts", error: null };
  }

  const subject =
    pending.length === 1
      ? `[Thuishaven] Alert: ${pending[0].title}`
      : `[Thuishaven] ${pending.length} sold-out alerts`;

  const { html, text } = renderMismatchAlertEmail(pending.map(toEmailItem));
  const result = await sendGatedAlertMail({ subject, html, text });

  if (!result.ok) {
    return { sent: 0, skipped: null, error: result.error };
  }

  const now = new Date();
  for (const row of pending) {
    await db
      .update(alerts)
      .set({ notifiedAt: now })
      .where(eq(alerts.id, row.id));
  }

  return { sent: pending.length, skipped: null, error: null };
}

export async function sendAlertTestEmail(): Promise<
  { ok: true; to: string[] } | { ok: false; error: string }
> {
  const { html, text } = renderTestAlertEmail();
  return sendGatedAlertMail({
    subject: "[Thuishaven] Test: sold-out alert mail",
    html,
    text,
  });
}
