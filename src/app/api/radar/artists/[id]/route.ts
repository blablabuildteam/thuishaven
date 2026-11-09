import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { hasDatabase } from "@/lib/db/client";
import {
  getRadarArtist,
  setRadarArtistStatus,
  updateRadarArtist,
} from "@/lib/radar/artists";
import { RADAR_ARTIST_STATUS_NL } from "@/lib/radar/types";
import { linkArtistToSpotifyBySearch } from "@/lib/radar/spotify-sync";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  status: z
    .enum([
      "new",
      "watching",
      "shortlist",
      "contacted",
      "booked",
      "passed",
      "not_relevant",
    ])
    .optional(),
  notes: z.string().max(4000).nullable().optional(),
  primaryGenre: z.string().max(80).nullable().optional(),
  secondaryGenres: z.array(z.string().max(80)).max(12).optional(),
  genreManual: z.boolean().optional(),
  syncSpotify: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }
  const dossier = await getRadarArtist(id);
  if (!dossier) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({
    ...dossier,
    statusLabel: RADAR_ARTIST_STATUS_NL[dossier.artist.status],
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Ongeldig id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  if (parsed.data.syncSpotify) {
    const sync = await linkArtistToSpotifyBySearch(id);
    if ("error" in sync) {
      return NextResponse.json({ error: sync.error }, { status: 400 });
    }
  }

  if (parsed.data.status) {
    const result = await setRadarArtistStatus(
      id,
      parsed.data.status,
      session.user.id,
    );
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  if (
    parsed.data.notes !== undefined ||
    parsed.data.primaryGenre !== undefined ||
    parsed.data.secondaryGenres !== undefined ||
    parsed.data.genreManual !== undefined
  ) {
    const result = await updateRadarArtist(id, {
      notes: parsed.data.notes,
      primaryGenre: parsed.data.primaryGenre,
      secondaryGenres: parsed.data.secondaryGenres,
      genreManual: parsed.data.genreManual,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  const dossier = await getRadarArtist(id);
  return NextResponse.json({ ok: true, dossier });
}
