import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logSessionActivity } from "@/lib/audit/session-log";
import {
  removeDjFeeArtist,
  updateDjFeeArtist,
  updateDjFeeArtistSchema,
} from "@/lib/dashboard/dj-fees";
import { hasDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    return NextResponse.json({ error: "Ongeldige DJ" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const parsed = updateDjFeeArtistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" },
      { status: 400 },
    );
  }

  const result = await updateDjFeeArtist(id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "DJ niet gevonden" }, { status: 404 });
  }

  await logSessionActivity(session, {
    action: "dj_fee_update",
    summary: `DJ-fee bijgewerkt: ${result.artist.name}`,
    path: `/api/dashboard/dj-fees/${id}`,
    method: "PATCH",
    status: 200,
    tool: "dashboard",
    meta: {
      artistId: id,
      feeRange: parsed.data.feeRange,
      isTenHour: parsed.data.isTenHour,
    },
  });

  const { invalidateEventInsightsCache } = await import(
    "@/lib/insights/event-insights"
  );
  await invalidateEventInsightsCache();

  return NextResponse.json({ ok: true, artist: result.artist });
}

export async function DELETE(
  _request: Request,
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
    return NextResponse.json({ error: "Ongeldige DJ" }, { status: 400 });
  }

  const result = await removeDjFeeArtist(id);
  if (!result.ok) {
    return NextResponse.json({ error: "DJ niet gevonden" }, { status: 404 });
  }

  await logSessionActivity(session, {
    action: "dj_fee_remove",
    summary: "DJ verwijderd van fee-overzicht",
    path: `/api/dashboard/dj-fees/${id}`,
    method: "DELETE",
    status: 200,
    tool: "dashboard",
    meta: { artistId: id },
  });

  const { invalidateEventInsightsCache } = await import(
    "@/lib/insights/event-insights"
  );
  await invalidateEventInsightsCache();

  return NextResponse.json({ ok: true });
}
