import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logSessionActivity } from "@/lib/audit/session-log";
import {
  addDjFeeArtist,
  addDjFeeArtistSchema,
  countPendingDjFeeEvents,
} from "@/lib/dashboard/dj-fees";
import { hasDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ count: 0 });
  }

  const count = await countPendingDjFeeEvents();
  return NextResponse.json({ count });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const parsed = addDjFeeArtistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" },
      { status: 400 },
    );
  }

  const result = await addDjFeeArtist(parsed.data);
  if (!result.ok) {
    const error =
      result.error === "not_found" ? "Event niet gevonden" : "Ongeldige DJ-naam";
    return NextResponse.json({ error }, { status: 400 });
  }

  await logSessionActivity(session, {
    action: "dj_fee_add",
    summary: `DJ toegevoegd: ${result.artist.name}`,
    path: "/api/dashboard/dj-fees",
    method: "POST",
    status: 201,
    tool: "dashboard",
    meta: { editionId: parsed.data.editionId, artistId: result.artist.id },
  });

  const { invalidateEventInsightsCache } = await import(
    "@/lib/insights/event-insights"
  );
  await invalidateEventInsightsCache();

  return NextResponse.json({ ok: true, artist: result.artist }, { status: 201 });
}
