import Link from "next/link";
import { Suspense } from "react";
import {
  RadarPageHeader,
  RadarStatStrip,
} from "@/components/radar/radar-page-header";
import { ArtistsWorkbench } from "@/components/radar/artists-workbench";
import { isSpotifyConfigured } from "@/lib/integrations/spotify/client";
import {
  listRadarArtists,
  type RadarArtistListSort,
} from "@/lib/radar/artists";
import { loadRadarOverviewStats } from "@/lib/radar/stats";
import type { RadarArtistStatus } from "@/lib/radar/types";

export const metadata = { title: "Artiesten · Radar" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function RadarArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    nieuw?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = (sp.sort as RadarArtistListSort) || "score";
  const status =
    sp.status && sp.status !== "all"
      ? (sp.status as RadarArtistStatus)
      : "all";
  const nieuw = sp.nieuw !== "0";

  const [stats, list] = await Promise.all([
    loadRadarOverviewStats(),
    listRadarArtists({
      q: sp.q,
      status,
      sort,
      nieuw,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      includeTotal: true,
    }),
  ]);

  return (
    <div>
      <RadarPageHeader
        title="Artiesten"
        description="Score = momentum + fit + bookability uit alle bronnen (RA, websites, IG, handmatig). Standaard alleen nieuw voor Thuishaven."
        actions={
          <div className="flex flex-col items-end gap-1 text-sm">
            <Link
              href="/radar/feesten"
              className="text-text-muted underline hover:text-text"
            >
              Feesten-overzicht
            </Link>
            <Link
              href="/radar/uitleg"
              className="text-text-muted underline hover:text-text"
            >
              Hoe werken de scores?
            </Link>
          </div>
        }
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

      <Suspense fallback={<p className="text-sm text-text-muted">Laden…</p>}>
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
            country: a.country,
            residentCountry: a.residentCountry,
            raFollowerCount: a.raFollowerCount,
            homeGigCount: a.homeGigCount,
            hasAgency: a.hasAgency,
          }))}
          total={list.total}
          page={page}
          pageSize={PAGE_SIZE}
          spotifyReady={isSpotifyConfigured()}
        />
      </Suspense>
    </div>
  );
}
