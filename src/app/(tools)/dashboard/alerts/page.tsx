import { auth } from "@/auth";
import { AlertsWorkbench } from "@/components/alerts/alerts-workbench";
import { hasDatabase } from "@/lib/db/client";
import { listStoredDashboardAlerts } from "@/lib/integrations/alerts";
import { listUpcomingAlertEditions } from "@/lib/integrations/alerts/evaluate";
import {
  alertEventTitle,
  formatEventDateShort,
} from "@/lib/integrations/alerts/event-label";
import { alertRecipientMeta } from "@/lib/integrations/alerts/recipients";
import { listAlertRules } from "@/lib/integrations/alerts/rules";

export const metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await auth();

  const [rules, stored, editions] = hasDatabase()
    ? await Promise.all([
        listAlertRules().catch(() => []),
        listStoredDashboardAlerts().catch(() => []),
        listUpcomingAlertEditions().catch(() => []),
      ])
    : [[], [], []];

  return (
    <AlertsWorkbench
      initialRules={rules.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        enabled: r.enabled,
        recipients: r.recipients,
        editionId: r.editionId,
        soldThreshold: r.soldThreshold,
        checkRa: r.checkRa,
        checkTicketswap: r.checkTicketswap,
        checkAppic: r.checkAppic,
        weatherKinds: r.weatherKinds,
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
      editions={editions.map((e) => ({
        id: e.id,
        label: `${formatEventDateShort(e.startsAt)} · ${alertEventTitle(e.name)}`,
      }))}
      meta={alertRecipientMeta()}
      currentUserEmail={session?.user?.email ?? ""}
      canSendTest={session?.user?.role === "admin"}
    />
  );
}
