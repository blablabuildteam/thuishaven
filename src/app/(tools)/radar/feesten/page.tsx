import { PartiesWorkbench } from "@/components/radar/parties-workbench";
import { RadarPageHeader } from "@/components/radar/radar-page-header";
import { listRadarParties } from "@/lib/radar/parties";
import { listRadarVenues } from "@/lib/radar/venues";

export const metadata = { title: "Feesten · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarFeestenPage() {
  const [parties, venues] = await Promise.all([
    listRadarParties({ upcomingOnly: true, status: "all", limit: 100 }),
    listRadarVenues({ status: ["seed", "accepted"] }),
  ]);

  return (
    <div>
      <RadarPageHeader
        title="Feesten"
        description="Totaaloverzicht van parties uit RA, websites, Instagram en handmatige line-ups. Spot talent in de line-up en volg ze verder."
      />
      <PartiesWorkbench
        initial={parties.map((p) => ({
          ...p,
          startsAt: p.startsAt?.toISOString() ?? null,
        }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name }))}
      />
    </div>
  );
}
