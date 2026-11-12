import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { hasDatabase } from "@/lib/db/client";
import { ingestPartyLineup } from "@/lib/radar/ingest-party";
import { listRadarParties } from "@/lib/radar/parties";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const sp = new URL(request.url).searchParams;
  const parties = await listRadarParties({
    upcomingOnly: sp.get("upcoming") !== "0",
    status: (sp.get("status") as "published" | "needs_review" | "all") || "all",
    venueId: sp.get("venueId") ?? undefined,
    limit: Number(sp.get("limit")) || 80,
  });
  return NextResponse.json({ parties });
}

const createSchema = z.object({
  venueId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300),
  startsAt: z.string().datetime().nullable().optional(),
  source: z.enum(["ra", "website", "instagram", "manual"]).optional(),
  externalUrl: z.string().max(1000).nullable().optional(),
  lineupText: z.string().min(1).max(8000),
  needsReview: z.boolean().optional(),
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
  const result = await ingestPartyLineup({
    venueId: parsed.data.venueId ?? null,
    title: parsed.data.title,
    startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
    source: parsed.data.source ?? "manual",
    externalUrl: parsed.data.externalUrl ?? null,
    lineupText: parsed.data.lineupText,
    needsReview: parsed.data.needsReview,
    alertOnCreate: true,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ party: result }, { status: 201 });
}
