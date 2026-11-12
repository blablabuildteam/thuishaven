import { notFound } from "next/navigation";
import { ArtistDossier } from "@/components/radar/artist-dossier";
import { getRadarArtist, getRadarArtistBadges } from "@/lib/radar/artists";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dossier = await getRadarArtist(id);
  return {
    title: dossier ? `${dossier.artist.name} · Radar` : "Artiest · Radar",
  };
}

export default async function RadarArtistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [dossier, badges] = await Promise.all([
    getRadarArtist(id),
    getRadarArtistBadges(id),
  ]);
  if (!dossier) notFound();

  return (
    <ArtistDossier
      badges={badges}
      artist={{
        id: dossier.artist.id,
        name: dossier.artist.name,
        status: dossier.artist.status,
        primaryGenre: dossier.artist.primaryGenre,
        secondaryGenres:
          (dossier.artist.secondaryGenres as string[] | null) ?? [],
        growthScore: dossier.artist.growthScore,
        growthVelocity: dossier.artist.growthVelocity,
        momentumScore: dossier.artist.momentumScore,
        fitScore: dossier.artist.fitScore,
        bookabilityScore: dossier.artist.bookabilityScore,
        scoreReasons: (dossier.artist.scoreReasons as string[] | null) ?? [],
        notes: dossier.artist.notes,
        discoverySource: dossier.artist.discoverySource,
        imageUrl: dossier.artist.imageUrl,
        growthBreakdown:
          (dossier.artist.growthBreakdown as Record<string, unknown> | null) ??
          null,
        homeGigCount: dossier.artist.homeGigCount,
        hasAgency: dossier.artist.hasAgency,
        raFollowerCount: dossier.artist.raFollowerCount,
        residentCountry: dossier.artist.residentCountry,
        nlAudienceScore: dossier.artist.nlAudienceScore,
        nlGigShare: dossier.artist.nlGigShare,
      }}
      profiles={dossier.profiles.map((p) => ({
        platform: p.platform,
        url: p.url,
        handle: p.handle,
        externalId: p.externalId,
        lastSyncedAt: p.lastSyncedAt,
        raw: (p.raw as Record<string, unknown> | null) ?? null,
      }))}
      recentMetrics={dossier.recentMetrics.map((m) => ({
        id: m.id,
        platform: m.platform,
        capturedAt: m.capturedAt,
        metrics: m.metrics,
      }))}
      recentGigs={dossier.recentGigs.map((g) => ({
        id: g.id,
        eventName: g.eventName,
        startsAt: g.startsAt,
        city: g.city,
        country: g.country,
        attending: g.attending,
        billingIndex: g.billingIndex,
        isHeadliner: g.isHeadliner,
        sourceUrl: g.sourceUrl,
        source: g.source,
      }))}
      mixseries={dossier.mixseries.map((m) => ({
        id: m.id,
        channelTitle: m.channelTitle,
        channelKey: m.channelKey,
        title: m.title,
        url: m.url,
        publishedAt: m.publishedAt,
        viewCount: m.viewCount,
      }))}
    />
  );
}
