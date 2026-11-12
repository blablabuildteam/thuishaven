import Link from "next/link";
import { Suspense } from "react";
import {
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { WatchlistWorkbench } from "@/components/radar/watchlist-workbench";
import { listRadarArtists } from "@/lib/radar/artists";
import { loadRaFollowerSparklines } from "@/lib/radar/metric-series";
import { parseBadgeFilter } from "@/lib/radar/badges";

export const metadata = { title: "Watchlist · Radar" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function RadarWatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; page?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const badges = parseBadgeFilter(sp.f);

  const [watchlist, candidates] = await Promise.all([
    listRadarArtists({
      q: sp.q,
      statuses: ["watching", "shortlist", "contacted"],
      th: "alle",
      badges,
      sort: (sp.sort as "score" | "momentum" | "newest") || "score",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      includeTotal: true,
    }),
    // Aanvoerband: sterke nieuwe namen om te volgen
    listRadarArtists({
      statuses: undefined,
      status: "new",
      th: "nieuw",
      sort: "score",
      limit: 12,
      includeTotal: false,
    }),
  ]);

  const sparklines = await loadRaFollowerSparklines(
    watchlist.rows.map((r) => r.id),
  );

  const watching = watchlist.rows.filter((r) => r.status === "watching").length;
  const shortlist = watchlist.rows.filter((r) => r.status === "shortlist").length;

  return (
    <div>
      <RadarPageHeader
        title="Watchlist"
        description="De namen die jij volgt — hier meten we groei. Zet iemand op Volgen vanaf Artiesten of Feesten; dan vullen we RA/IG/SC-snapshots en sturen we een Lanceert-alert bij een knik."
        actions={
          <Link
            href="/radar/artiesten?th=nieuw"
            className="text-sm text-text-muted underline hover:text-text"
          >
            Ontdekken →
          </Link>
        }
      />
      <RadarStatStrip
        items={[
          { label: "Op de watchlist", value: watchlist.total },
          { label: "Volgen (deze pagina)", value: watching },
          { label: "Shortlist (deze pagina)", value: shortlist },
          {
            label: "Kandidaten om te volgen",
            value: candidates.rows.length,
            hint: "Top nieuw voor TH",
          },
        ]}
      />
      <Suspense fallback={null}>
        <WatchlistWorkbench
          initial={watchlist.rows.map((a) => ({
            id: a.id,
            name: a.name,
            status: a.status,
            growthScore: a.growthScore,
            momentumScore: a.momentumScore,
            fitScore: a.fitScore,
            bookabilityScore: a.bookabilityScore,
            scoreReasons: a.scoreReasons ?? [],
            residentCountry: a.residentCountry,
            country: a.country,
            raFollowerCount: a.raFollowerCount,
            badges: a.badges,
            sparkline: sparklines.get(a.id) ?? [],
          }))}
          total={watchlist.total}
          page={page}
          pageSize={PAGE_SIZE}
          candidates={candidates.rows
            .filter((c) => Number(c.growthScore ?? 0) >= 50)
            .slice(0, 8)
            .map((a) => ({
              id: a.id,
              name: a.name,
              growthScore: a.growthScore,
              momentumScore: a.momentumScore,
              residentCountry: a.residentCountry,
              country: a.country,
              badges: a.badges,
              scoreReasons: a.scoreReasons ?? [],
            }))}
        />
      </Suspense>
    </div>
  );
}
