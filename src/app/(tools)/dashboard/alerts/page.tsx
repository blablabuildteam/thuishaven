import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { activeAlerts } from "@/lib/mock/dashboard";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const metadata = { title: "Alerts" };

export default function AlertsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Alerting"
        title="TicketSwap & sync"
        description="Dashboard-indicator én e-mailnotificatie wanneer primaire verkoop sold-out is maar secundaire kanalen nog actief zijn."
      />

      <div className="space-y-3">
        {activeAlerts.map((alert) => (
          <article
            key={alert.id}
            className="border border-danger/40 bg-danger/5 p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="danger" pulse>
                Actief
              </StatusBadge>
              <StatusBadge tone="neutral">{alert.type.replaceAll("_", " ")}</StatusBadge>
            </div>
            <h2 className="mt-3 font-display text-xl tracking-tight text-text">
              {alert.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
              {alert.message}
            </p>
            <p className="mt-4 text-xs text-text-dim">
              Gedetecteerd{" "}
              {format(new Date(alert.createdAt), "d MMMM yyyy · HH:mm", {
                locale: nl,
              })}
              {" · "}
              Notificatie naar sales/marketing (configureren via env)
            </p>
          </article>
        ))}

        <article className="border border-border bg-surface p-5 opacity-70">
          <StatusBadge tone="success">Resolved</StatusBadge>
          <h2 className="mt-3 font-display text-lg text-text-muted">
            Voorbeeld: sync Weeztix hersteld
          </h2>
          <p className="mt-2 text-sm text-text-dim">
            Placeholder voor historie — wordt gevuld zodra pipelines live draaien.
          </p>
        </article>
      </div>
    </div>
  );
}
