import { and, eq, inArray } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { systemAlerts } from "@/lib/db/schema";
import {
  alertSender,
  sendBrevoTransactionalEmail,
} from "@/lib/integrations/brevo/client";
import {
  renderAlertEmail,
  type AlertEmailItem,
} from "@/lib/integrations/alerts/email";
import {
  gateAlertRecipients,
  isAlertEmailEnabled,
  parseRecipientInput,
} from "@/lib/integrations/alerts/recipients";
import { logIntegration } from "@/lib/integrations/log";
import { MONITORS } from "./monitors";
import type { MonitorHealth, SystemHealth } from "./types";

/**
 * Break/recovery mails for integrations. Only production sends: local dev
 * shares the database and often runs with stale tokens, and letting it write
 * alert state would also stop production from mailing about the same problem.
 */
function systemAlertsEnabled(): boolean {
  const flag = process.env.SYSTEM_ALERTS_ENABLED?.trim().toLowerCase();
  if (flag === "false") return false;
  return process.env.VERCEL_ENV === "production" || flag === "true";
}

/** Technical mail → builders by default; override with SYSTEM_ALERT_EMAIL. */
function systemAlertRecipients(): string[] {
  const env = parseRecipientInput(process.env.SYSTEM_ALERT_EMAIL);
  return env.length ? env : ["team@blablabuild.com"];
}

function stateOf(m: MonitorHealth | undefined): string {
  if (!m || m.severity === "ok") return "ok";
  return `${m.severity}:${m.kind}`;
}

type Change = {
  key: string;
  monitorId: string;
  previous: string | null;
  next: string;
  health: MonitorHealth | undefined;
};

export type SystemNotifyResult =
  | { ok: true; skipped: string }
  | { ok: true; changes: number; mailed: string[] }
  | { ok: false; error: string };

/**
 * Compares current health to the last notified state per monitor and mails
 * once per change (ok → down, down → ok, …). State is only written after the
 * mail went out, so a failed send retries on the next check.
 */
export async function notifySystemHealthChanges(
  health: SystemHealth,
): Promise<SystemNotifyResult> {
  if (!systemAlertsEnabled()) return { ok: true, skipped: "not_production" };
  if (!hasDatabase()) return { ok: true, skipped: "no_database" };

  const db = getDb();
  const keys = MONITORS.map((m) => `monitor:${m.id}`);
  const stored = await db
    .select()
    .from(systemAlerts)
    .where(inArray(systemAlerts.key, keys));
  const storedByKey = new Map(stored.map((r) => [r.key, r.state]));
  const issueById = new Map(health.issues.map((i) => [i.id, i]));

  const changes: Change[] = [];
  for (const def of MONITORS) {
    const key = `monitor:${def.id}`;
    const health = issueById.get(def.id);
    const next = stateOf(health);
    const previous = storedByKey.get(key) ?? null;
    // No row yet and healthy: nothing to report, just start tracking.
    if (previous === null && next === "ok") continue;
    if (previous === next) continue;
    changes.push({ key, monitorId: def.id, previous, next, health });
  }

  if (!changes.length) return { ok: true, changes: 0, mailed: [] };

  if (!isAlertEmailEnabled()) {
    return { ok: true, skipped: "alert_email_disabled" };
  }
  const recipients = gateAlertRecipients(systemAlertRecipients());
  if (!recipients.ok) return { ok: false, error: recipients.error };

  const labelOf = (id: string) =>
    MONITORS.find((m) => m.id === id)?.label ?? id;

  const items: AlertEmailItem[] = changes.map((c) => {
    if (c.next === "ok") {
      return {
        channel: labelOf(c.monitorId),
        kind: "system_ok",
        title: `${labelOf(c.monitorId)} werkt weer`,
        message: "De koppeling geeft weer antwoord en de laatste sync is gelukt.",
      };
    }
    const h = c.health!;
    return {
      channel: h.label,
      kind: h.severity === "down" ? "system_down" : "system_degraded",
      title: h.impact,
      message: [h.detail, h.action].filter(Boolean).join(" "),
    };
  });

  const broken = changes.filter((c) => c.next !== "ok");
  const anyDown = broken.some((c) => c.health?.severity === "down");
  const subject = broken.length
    ? `${anyDown ? "Storing" : "Waarschuwing"}: ${broken.map((c) => labelOf(c.monitorId)).join(", ")}`
    : `Hersteld: ${changes.map((c) => labelOf(c.monitorId)).join(", ")}`;

  const { html, text } = renderAlertEmail({
    eyebrow: "Systeemstatus",
    title: subject,
    intro: broken.length
      ? "Een of meer koppelingen werken niet goed. Het dashboard toont een melding tot dit is opgelost."
      : "De eerder gemelde problemen zijn opgelost.",
    items,
    ctaLabel: "Open bronnen",
    ctaUrl: "/koppelingen",
    footer: "Thuishaven Tools · systeemstatus. Je krijgt één mail per wijziging.",
  });

  const sent = await sendBrevoTransactionalEmail({
    to: recipients.to,
    subject: `Thuishaven · ${subject}`,
    html,
    text,
    sender: alertSender(),
  });
  if (!sent.ok) {
    await logIntegration({
      source: "system",
      level: "error",
      event: "system_alert.mail_failed",
      message: sent.error,
    });
    return { ok: false, error: sent.error };
  }

  for (const c of changes) {
    const message = c.health?.detail ?? null;
    if (c.previous === null) {
      await db
        .insert(systemAlerts)
        .values({ key: c.key, state: c.next, message })
        .onConflictDoUpdate({
          target: systemAlerts.key,
          set: { state: c.next, message, updatedAt: new Date() },
        });
    } else {
      await db
        .update(systemAlerts)
        .set({ state: c.next, message, updatedAt: new Date() })
        .where(and(eq(systemAlerts.key, c.key), eq(systemAlerts.state, c.previous)));
    }
  }

  await logIntegration({
    source: "system",
    level: "info",
    event: "system_alert.mailed",
    message: subject,
    detail: { to: recipients.to, changes: changes.map((c) => `${c.monitorId}:${c.next}`) },
    throttleMs: 0,
  });

  return { ok: true, changes: changes.length, mailed: recipients.to };
}
