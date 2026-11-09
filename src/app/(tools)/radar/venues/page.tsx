import {
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { VenuesWorkbench } from "@/components/radar/venues-workbench";
import { loadRadarOverviewStats } from "@/lib/radar/stats";
import { listRadarVenues } from "@/lib/radar/venues";

export const metadata = { title: "Venues · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarVenuesPage() {
  const [stats, venues] = await Promise.all([
    loadRadarOverviewStats(),
    listRadarVenues(),
  ]);

  return (
    <div>
      <RadarPageHeader
        title="Venues"
        description="Startlijst voedt de sneeuwbal. Zonder RA-club-id kunnen we geen line-ups ophalen voor die venue."
      />
      <RadarStatStrip
        items={[
          { label: "Startlijst", value: stats.venuesSeed },
          { label: "Suggesties", value: stats.venuesSuggested },
          { label: "Artiesten", value: stats.artists },
        ]}
      />
      <VenuesWorkbench
        initial={venues.map((v) => ({
          id: v.id,
          name: v.name,
          kind: v.kind,
          status: v.status,
          tier: v.tier,
          city: v.city,
          country: v.country,
          raUrl: v.raUrl,
          websiteUrl: v.websiteUrl,
          notes: v.notes,
          venueScore: v.venueScore,
          curatorScore: v.curatorScore,
        }))}
      />
    </div>
  );
}
