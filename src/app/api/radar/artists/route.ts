import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { hasDatabase } from "@/lib/db/client";
import { listRadarArtists, upsertRadarArtist } from "@/lib/radar/artists";
import { addArtistFromSpotifySearch } from "@/lib/radar/spotify-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "all";
  const sortParam = url.searchParams.get("sort") ?? "score";
  const result = await listRadarArtists({
    q: url.searchParams.get("q") ?? undefined,
    status: statusParam as
      | "all"
      | "new"
      | "watching"
      | "shortlist"
      | "contacted"
      | "booked"
      | "passed"
      | "not_relevant",
    genre: url.searchParams.get("genre") ?? undefined,
    sort: sortParam as "score" | "name" | "newest",
    limit: Number(url.searchParams.get("limit") ?? 80) || 80,
    offset: Number(url.searchParams.get("offset") ?? 0) || 0,
  });
  return NextResponse.json(result);
}

const createSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  spotifyQuery: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  if (parsed.data.spotifyQuery) {
    const result = await addArtistFromSpotifySearch(parsed.data.spotifyQuery);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  }

  if (!parsed.data.name) {
    return NextResponse.json({ error: "Naam of spotifyQuery verplicht" }, { status: 400 });
  }
  const result = await upsertRadarArtist({
    name: parsed.data.name,
    discoverySource: "manual",
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(
    { artistId: result.artist.id, created: result.created, artist: result.artist },
    { status: 201 },
  );
}
