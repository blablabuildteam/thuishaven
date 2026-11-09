import {
  RadarEmptyState,
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { loadRadarOverviewStats } from "@/lib/radar/stats";

export const metadata = { title: "Alerts · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarAlertsPage() {
  const stats = await loadRadarOverviewStats();

  return (
    <div>
      <RadarPageHeader
        title="Alerts"
        description="Plotselinge groei en nieuwe namen op de radar. Drempels stellen we bij tijdens de calibratie. Digest gaat voorlopig alleen per e-mail."
      />

      <RadarStatStrip
        items={[
          { label: "Open", value: stats.unreadAlerts },
          { label: "Op de radar", value: stats.artists },
          { label: "Kortlijst", value: stats.shortlist },
        ]}
      />

      {stats.unreadAlerts === 0 ? (
        <RadarEmptyState
          title="Geen open alerts"
          body="Zodra de pipeline draait, verschijnen hier velocity-alerts en ‘nieuw op de radar’-meldingen."
        />
      ) : (
        <div className="border border-border px-3 py-8 text-sm text-text-muted sm:px-4">
          Alertlijst volgt hier.
        </div>
      )}
    </div>
  );
}
