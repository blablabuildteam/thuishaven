import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { runRadarPipeline } from "@/lib/radar/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  skipDiscovery: z.boolean().optional(),
  skipSpotify: z.boolean().optional(),
  skipSocial: z.boolean().optional(),
  skipDigest: z.boolean().optional(),
  forceDigest: z.boolean().optional(),
  spotifyLimit: z.number().int().min(1).max(200).optional(),
  venueLimit: z.number().int().min(1).max(40).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Alleen admin" }, { status: 403 });
  }
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  const result = await runRadarPipeline(parsed.data);
  return NextResponse.json(result);
}
