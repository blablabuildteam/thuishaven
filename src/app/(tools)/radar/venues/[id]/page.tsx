import { notFound } from "next/navigation";
import { VenueDossier } from "@/components/radar/venue-dossier";
import { getRadarVenue, listVenueParties } from "@/lib/radar/venues";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const venue = await getRadarVenue(id);
  return { title: venue ? `${venue.name} · Radar` : "Venue · Radar" };
}

export default async function RadarVenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const venue = await getRadarVenue(id);
  if (!venue) notFound();
  const parties = await listVenueParties(id, { limit: 80 });

  return (
    <VenueDossier
      venue={{
        id: venue.id,
        name: venue.name,
        kind: venue.kind,
        status: venue.status,
        tier: venue.tier,
        city: venue.city,
        country: venue.country,
        raUrl: venue.raUrl,
        curatorScore: venue.curatorScore,
        venueScore: venue.venueScore,
        notes: venue.notes,
      }}
      parties={parties}
    />
  );
}
