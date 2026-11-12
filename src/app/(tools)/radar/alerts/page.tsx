import { RadarPageHeader } from "@/components/radar/radar-page-header";
import { AlertsWorkbench } from "@/components/radar/alerts-workbench";
import {
  RADAR_ALERT_DEF_BY_KIND,
  type RadarAlertKind,
} from "@/lib/radar/alert-defs";
import { listRadarAlerts, radarAlertCounts } from "@/lib/radar/alerts";

export const metadata = { title: "Alerts · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; alles?: string }>;
}) {
  const sp = await searchParams;
  const kind =
    sp.type && RADAR_ALERT_DEF_BY_KIND.has(sp.type as RadarAlertKind)
      ? (sp.type as RadarAlertKind)
      : null;
  const unreadOnly = sp.alles !== "1";

  const [alerts, counts] = await Promise.all([
    listRadarAlerts({
      unreadOnly,
      kinds: kind ? [kind] : undefined,
      limit: 120,
    }),
    radarAlertCounts(),
  ]);

  return (
    <div>
      <RadarPageHeader
        title="Alerts"
        description="Signalen die om een beslissing vragen. Elk type zegt wat er gebeurde en wat je ermee doet. Werk ze af met ‘Gelezen’."
      />
      <AlertsWorkbench
        kind={kind}
        unreadOnly={unreadOnly}
        counts={counts}
        initial={alerts.map((a) => ({
          id: a.id,
          kind: a.kind as RadarAlertKind,
          title: a.title,
          body: a.body,
          artistId: a.artistId,
          artistName: a.artistName,
          artistHomeGigCount: a.artistHomeGigCount,
          venueId: a.venueId,
          venueName: a.venueName,
          triggeredAt: a.triggeredAt.toISOString(),
          readAt: a.readAt ? a.readAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
