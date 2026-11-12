import { PartiesWorkbench } from "@/components/radar/parties-workbench";
import { RadarPageHeader } from "@/components/radar/radar-page-header";
import { listRadarParties, PARTY_TALENT_MIN_SCORE } from "@/lib/radar/parties";
import { listRadarVenues } from "@/lib/radar/venues";

export const metadata = { title: "Feesten · Radar" };
export const dynamic = "force-dynamic";

function amsterdamDayKey(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

export default async function RadarFeestenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const when = sp.wanneer === "afgelopen" ? "past" : "upcoming";
  const [parties, venues] = await Promise.all([
    listRadarParties({ when, status: "all", limit: 400 }),
    listRadarVenues({ status: ["seed", "accepted"] }),
  ]);
  const now = new Date();

  return (
    <div>
      <RadarPageHeader
        title="Feesten"
        description="De line-ups van de clubs en festivals die we volgen, per dag. Zo zie je wie er binnenkort waar draait — en welke namen nieuw voor Thuishaven zijn en het bekijken waard."
      />
      <PartiesWorkbench
        when={when}
        todayKey={amsterdamDayKey(now)}
        tomorrowKey={amsterdamDayKey(new Date(now.getTime() + 86_400_000))}
        talentMin={PARTY_TALENT_MIN_SCORE}
        initial={parties.map((p) => ({
          ...p,
          startsAt: p.startsAt?.toISOString() ?? null,
          dayKey: p.startsAt ? amsterdamDayKey(p.startsAt) : null,
        }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name }))}
      />
    </div>
  );
}
