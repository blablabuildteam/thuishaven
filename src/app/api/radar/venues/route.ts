import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { hasDatabase } from "@/lib/db/client";
import { createRadarVenue, listRadarVenues } from "@/lib/radar/venues";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const status = new URL(request.url).searchParams.get("status");
  const statuses = status
    ? (status.split(",") as Array<"seed" | "suggested" | "accepted" | "rejected">)
    : undefined;
  const venues = await listRadarVenues({ status: statuses });
  return NextResponse.json({ venues });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["club", "festival", "other"]).optional(),
  status: z.enum(["seed", "suggested", "accepted", "rejected"]).optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  raUrl: z.string().max(500).nullable().optional(),
  websiteUrl: z.string().max(500).nullable().optional(),
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
  const result = await createRadarVenue(parsed.data);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ venue: result.venue }, { status: 201 });
}
