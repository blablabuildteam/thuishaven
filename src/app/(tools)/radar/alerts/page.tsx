import {
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { AlertsWorkbench } from "@/components/radar/alerts-workbench";
import { listRadarAlerts } from "@/lib/radar/alerts";
import { loadRadarOverviewStats } from "@/lib/radar/stats";

export const metadata = { title: "Alerts · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarAlertsPage() {
  const [stats, alerts] = await Promise.all([
    loadRadarOverviewStats(),
    listRadarAlerts({ limit: 80 }),
  ]);

  return (
    <div>
      <RadarPageHeader
        title="Alerts"
        description="Twee types: plotselinge groei (velocity) en nieuwe namen boven de drempel. Drempels stel je bij in Instellingen."
      />
      <RadarStatStrip
        items={[
          { label: "Open", value: stats.unreadAlerts },
          { label: "Op de radar", value: stats.artists },
          { label: "Kortlijst", value: stats.shortlist },
        ]}
      />
      <AlertsWorkbench
        initial={alerts.map((a) => ({
          id: a.id,
          kind: a.kind,
          title: a.title,
          body: a.body,
          artistId: a.artistId,
          venueId: a.venueId,
          triggeredAt: a.triggeredAt,
          readAt: a.readAt,
        }))}
      />
    </div>
  );
}
