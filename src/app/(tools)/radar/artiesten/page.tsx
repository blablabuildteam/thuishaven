import {
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { ArtistsWorkbench } from "@/components/radar/artists-workbench";
import { isSpotifyConfigured } from "@/lib/integrations/spotify/client";
import { listRadarArtists } from "@/lib/radar/artists";
import { loadRadarOverviewStats } from "@/lib/radar/stats";

export const metadata = { title: "Artiesten · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarArtistsPage() {
  const [stats, list] = await Promise.all([
    loadRadarOverviewStats(),
    listRadarArtists({ sort: "score", limit: 120 }),
  ]);

  return (
    <div>
      <RadarPageHeader
        title="Artiesten"
        description="Score = momentum × fit × bookability, vooral uit RA-boekingen. Redenen staan onder de naam."
      />

      <RadarStatStrip
        items={[
          { label: "Op de radar", value: stats.artists },
          { label: "Shortlist", value: stats.shortlist },
          { label: "Startvenues", value: stats.venuesSeed },
          { label: "Venue-suggesties", value: stats.venuesSuggested },
          { label: "Alerts open", value: stats.unreadAlerts },
        ]}
      />

      <ArtistsWorkbench
        initial={list.rows.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          primaryGenre: a.primaryGenre,
          growthScore: a.growthScore,
          growthVelocity: a.growthVelocity,
          momentumScore: a.momentumScore,
          fitScore: a.fitScore,
          bookabilityScore: a.bookabilityScore,
          scoreReasons: (a.scoreReasons as string[] | null) ?? [],
          discoverySource: a.discoverySource,
          imageUrl: a.imageUrl,
        }))}
        total={list.total}
        spotifyReady={isSpotifyConfigured()}
      />
    </div>
  );
}
