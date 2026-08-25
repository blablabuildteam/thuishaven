import { auth } from "@/auth";
import { AlertsWorkbench } from "@/components/alerts/alerts-workbench";
import { hasDatabase } from "@/lib/db/client";
import { listStoredDashboardAlerts } from "@/lib/integrations/alerts";
import { alertRecipientMeta } from "@/lib/integrations/alerts/recipients";
import {
  ensureDefaultAlertRule,
  listAlertRules,
} from "@/lib/integrations/alerts/rules";

export const metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await auth();
  if (hasDatabase()) {
    await ensureDefaultAlertRule().catch(() => null);
  }

  const rules = hasDatabase() ? await listAlertRules().catch(() => []) : [];
  const stored = hasDatabase()
    ? await listStoredDashboardAlerts().catch(() => [])
    : [];

  return (
    <AlertsWorkbench
      initialRules={rules.map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        recipients: r.recipients,
        soldThreshold: r.soldThreshold,
        checkRa: r.checkRa,
        checkTicketswap: r.checkTicketswap,
        checkAppic: r.checkAppic,
      }))}
      initialNotifications={stored.map((row) => ({
        id: row.id,
        type: row.type,
        ruleId: row.ruleId,
        title: row.title,
        message: row.message,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        notifiedAt: row.notifiedAt?.toISOString() ?? null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
      }))}
      meta={alertRecipientMeta()}
      canSendTest={session?.user?.role === "admin"}
    />
  );
}
