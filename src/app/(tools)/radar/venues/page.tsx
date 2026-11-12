import {
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { VenuesWorkbench } from "@/components/radar/venues-workbench";
import { listRadarVenues } from "@/lib/radar/venues";

export const metadata = { title: "Clubs · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarClubsPage() {
  const venues = (await listRadarVenues()).filter((v) => v.kind !== "festival");
  const following = venues.filter((v) => v.status === "seed" || v.status === "accepted");
  const suggested = venues.filter((v) => v.status === "suggested");

  return (
    <div>
      <RadarPageHeader
        title="Clubs"
        description="De clubs waar we talent scouten. Radar leest hun line-ups en ontdekt zo nieuwe namen. Suggesties zijn clubs waar veel Radar-artiesten spelen — accepteer de goede."
      />
      <RadarStatStrip
        items={[
          { label: "Clubs die we volgen", value: following.length },
          { label: "Suggesties", value: suggested.length },
          {
            label: "Early-tier",
            value: following.filter((v) => v.tier === "early").length,
          },
        ]}
      />
      <VenuesWorkbench kind="club" initial={venues.map(toRow)} />
    </div>
  );
}

function toRow(v: Awaited<ReturnType<typeof listRadarVenues>>[number]) {
  return {
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
  };
}
