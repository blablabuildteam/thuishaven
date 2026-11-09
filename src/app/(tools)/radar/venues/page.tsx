import {
  RadarEmptyState,
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { loadRadarOverviewStats } from "@/lib/radar/stats";

export const metadata = { title: "Venues · Radar" };
export const dynamic = "force-dynamic";

export default async function RadarVenuesPage() {
  const stats = await loadRadarOverviewStats();

  return (
    <div>
      <RadarPageHeader
        title="Venues"
        description="Startlijst van clubs en festivals. Suggesties uit de sneeuwbal verschijnen hier ter goedkeuring."
      />

      <RadarStatStrip
        items={[
          { label: "Startlijst", value: stats.venuesSeed },
          { label: "Suggesties", value: stats.venuesSuggested },
          { label: "Artiesten", value: stats.artists },
        ]}
      />

      {stats.venuesSeed === 0 && stats.venuesSuggested === 0 ? (
        <RadarEmptyState
          title="Startlijst is leeg"
          body="Voeg de clubs en festivals toe waar jullie talent willen spotten. Dat wordt het vertrekpunt van de sneeuwbal — niet de harde grens."
        />
      ) : (
        <div className="border border-border px-3 py-8 text-sm text-text-muted sm:px-4">
          Venue-tabel volgt in de volgende stap, inclusief toevoegen en
          suggesties accepteren.
        </div>
      )}
    </div>
  );
}
