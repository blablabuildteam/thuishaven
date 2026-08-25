import Link from "next/link";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasDatabase } from "@/lib/db/client";
import {
  listOpenDashboardAlerts,
  listStoredDashboardAlerts,
} from "@/lib/integrations/alerts";
import { AlertTestMailButton } from "@/components/alerts/test-mail-button";
import { weeztixSoldThreshold } from "@/lib/integrations/weeztix/sold-out";

export const metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const open = hasDatabase()
    ? await listOpenDashboardAlerts().catch(() => ({
        ra: [],
        ticketswap: [],
        appic: [],
        conflicts: [],
      }))
    : { ra: [], ticketswap: [], appic: [], conflicts: [] };
  const stored = hasDatabase()
    ? await listStoredDashboardAlerts().catch(() => [])
    : [];
  const openIds = new Set(open.conflicts.map((c) => c.editionId));
  const resolved = stored.filter(
    (a) => !a.isActive || (a.editionId && !openIds.has(a.editionId)),
  );
  const empty = open.conflicts.length === 0;
  const notifyTo = process.env.ALERT_NOTIFY_EMAIL?.trim() || null;
  const emailEnabled =
    process.env.ALERT_EMAIL_ENABLED?.trim().toLowerCase() === "true";
  const allowlist =
    process.env.ALERT_EMAIL_ALLOWLIST?.trim() || "team@blablabuild.com";
  const soldThreshold = weeztixSoldThreshold();

  return (
    <div>
      <SectionHeader
        eyebrow="Primair vs secundair"
        title="Sold-out alerts"
        description="Primair is Weeztix (publieke tickettypes, of sold ≥ drempel als er geen cap is). Zodra Weeztix uitverkocht is terwijl RA, TicketSwap of Appic nog verkopen, verschijnt hier een alert — overboeking of omzetlek."
        action={<AlertTestMailButton />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="border border-border bg-surface px-4 py-3">
          <p className="text-xs tracking-[0.08em] text-text-dim uppercase">
            Primair
          </p>
          <p className="mt-1 font-display text-lg text-text">Weeztix</p>
          <p className="mt-1 text-xs text-text-muted">
            Bron voor “uitverkocht”
            {soldThreshold != null
              ? ` · drempel ${soldThreshold.toLocaleString("nl-NL")} sold als er geen cap is`
              : ""}
          </p>
        </div>
        <div className="border border-border bg-surface px-4 py-3 sm:col-span-2">
          <p className="text-xs tracking-[0.08em] text-text-dim uppercase">
            Secundair
          </p>
          <p className="mt-1 font-display text-lg text-text">
            RA · TicketSwap · Appic
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Alert als Weeztix sold-out is en dit kanaal nog open staat. Weekedities
            tellen als uitverkocht als de publieke types (early bird / regular /
            late) vol zijn, of als sold de drempel haalt. Appic volgt zodra die
            koppeling live is.
            {emailEnabled && notifyTo ? (
              <>
                {" "}
                Mail aan <span className="text-text">{notifyTo}</span> (allowlist:{" "}
                {allowlist}).
              </>
            ) : (
              <>
                {" "}
                Mail staat uit of niet geconfigureerd (ALERT_EMAIL_ENABLED +
                allowlist).
              </>
            )}
          </p>
        </div>
      </div>

      {empty && (
        <p className="mb-6 border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          Geen actieve mismatch. Bij elke Weeztix-/RA-/TicketSwap-sync leggen we
          secundaire kanalen naast Weeztix.
        </p>
      )}

      <div className="space-y-3">
        {open.conflicts.map((alert) => {
          const isOverbooking = alert.kind === "overbooking";
          return (
            <article
              key={`${alert.channel}-${alert.editionId}`}
              className={
                isOverbooking
                  ? "border border-danger/40 bg-danger/5 p-5"
                  : "border border-warn/40 bg-warn/10 p-5"
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={isOverbooking ? "danger" : "warn"} pulse>
                  Actief
                </StatusBadge>
                <StatusBadge tone="neutral">{alert.channelLabel}</StatusBadge>
                <StatusBadge tone="neutral">
                  {isOverbooking ? "Overboeking" : "Omzetlek"}
                </StatusBadge>
              </div>
              <h2 className="mt-3 font-display text-xl tracking-tight text-text">
                {alert.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
                {alert.message}
              </p>
              <p className="mt-4 text-xs text-text-dim">
                {format(alert.startsAt, "d MMMM yyyy · HH:mm", { locale: nl })}
                {alert.url ? (
                  <>
                    {" · "}
                    <Link
                      href={alert.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-text"
                    >
                      Open {alert.channelLabel}
                    </Link>
                  </>
                ) : null}
              </p>
            </article>
          );
        })}

        {resolved.slice(0, 8).map((alert) => (
          <article
            key={alert.id}
            className="border border-border bg-surface p-5 opacity-70"
          >
            <StatusBadge tone="success">Opgelost</StatusBadge>
            <h2 className="mt-3 font-display text-lg text-text-muted">
              {alert.title}
            </h2>
            <p className="mt-2 text-sm text-text-dim">{alert.message}</p>
            {alert.resolvedAt && (
              <p className="mt-3 text-xs text-text-dim">
                Opgelost{" "}
                {format(alert.resolvedAt, "d MMMM yyyy · HH:mm", { locale: nl })}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
