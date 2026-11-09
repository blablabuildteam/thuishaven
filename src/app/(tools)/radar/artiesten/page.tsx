import Link from "next/link";
import {
  RadarEmptyState,
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { loadRadarOverviewStats } from "@/lib/radar/stats";

export const metadata = { title: "Artiesten · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarArtistsPage() {
  const stats = await loadRadarOverviewStats();
  const empty = stats.artists === 0 && stats.venuesSeed === 0;

  return (
    <div>
      <RadarPageHeader
        title="Artiesten"
        description="Groeiscore, genre en status per DJ. Sorteren en filteren komt eraan zodra de eerste bronnen live zijn."
      />

      <RadarStatStrip
        items={[
          { label: "Op de radar", value: stats.artists },
          { label: "Kortlijst", value: stats.shortlist },
          {
            label: "Startvenues",
            value: stats.venuesSeed,
            hint: "seed + accepted",
          },
          { label: "Venue-suggesties", value: stats.venuesSuggested },
          { label: "Alerts open", value: stats.unreadAlerts },
        ]}
      />

      {empty ? (
        <RadarEmptyState
          title="Nog geen artiesten"
          body="Begin met de startlijst van clubs en festivals. Daarna vullen we de radar via Spotify, socials en Resident Advisor."
          action={
            <Link
              href="/radar/venues"
              className="inline-flex border border-border bg-surface px-3 py-2 text-sm transition-colors hover:border-accent"
            >
              Startlijst venues →
            </Link>
          }
        />
      ) : (
        <div className="border border-border">
          <div className="grid grid-cols-[minmax(0,1.4fr)_auto_auto_auto] gap-3 border-b border-border px-3 py-2 text-[10px] tracking-[0.12em] text-text-dim uppercase sm:px-4">
            <span>Artiest</span>
            <span className="text-right">Score</span>
            <span className="hidden text-right sm:block">Genre</span>
            <span className="text-right">Status</span>
          </div>
          <p className="px-3 py-8 text-sm text-text-muted sm:px-4">
            Lijst verschijnt hier zodra er artiesten in de database staan.
          </p>
        </div>
      )}
    </div>
  );
}
