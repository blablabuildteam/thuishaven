import {
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { VenuesWorkbench } from "@/components/radar/venues-workbench";
import { listRadarVenues } from "@/lib/radar/venues";

export const metadata = { title: "Festivals · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarFestivalsPage() {
  const festivals = (await listRadarVenues()).filter((v) => v.kind === "festival");
  const following = festivals.filter((v) => v.status === "seed" || v.status === "accepted");
  const nl = following.filter((v) => (v.country ?? "").toUpperCase() === "NL");

  return (
    <div>
      <RadarPageHeader
        title="Festivals"
        description="Festivals waar breakouts vroeg op de line-up staan. Radar haalt hun line-ups op via de RA-promoter (festivals hebben op RA geen vaste club)."
      />
      <RadarStatStrip
        items={[
          { label: "Festivals die we volgen", value: following.length },
          { label: "In Nederland", value: nl.length },
          { label: "Buitenland", value: following.length - nl.length },
        ]}
      />
      <VenuesWorkbench
        kind="festival"
        initial={festivals.map((v) => ({
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
