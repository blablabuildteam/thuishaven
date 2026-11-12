import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  DEFAULT_RADAR_SETTINGS,
  loadRadarSettings,
  saveRadarSettings,
} from "@/lib/radar/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const settings = await loadRadarSettings();
  return NextResponse.json({ settings, defaults: DEFAULT_RADAR_SETTINGS });
}

const settingsSchema = z.object({
  weights: z.object({
    spotify: z.number(),
    instagram: z.number(),
    tiktok: z.number(),
    soundcloud: z.number(),
    resident_advisor: z.number(),
  }),
  velocityShare: z.number().min(0).max(1),
  unknownCeilings: z.object({
    spotifyFollowers: z.number(),
    spotifyPopularity: z.number(),
    instagramFollowers: z.number(),
    tiktokFollowers: z.number(),
    soundcloudFollowers: z.number(),
    raFavorites: z.number(),
  }),
  alerts: z.object({
    velocityThreshold: z.number(),
    newOnRadarMinScore: z.number(),
  }),
  digest: z.object({
    enabled: z.boolean(),
    weekday: z.number().int().min(1).max(7),
    hourAmsterdam: z.number().int().min(0).max(23),
    recipients: z.array(z.string().email()),
  }),
  refresh: z.object({
    spotifyHours: z.number(),
    socialHours: z.number(),
    raHours: z.number(),
  }),
  discovery: z.object({
    maxHops: z.number().int().min(0).max(3),
    venueSuggestMinScore: z.number(),
  }),
  labelWatchlist: z.array(z.string().min(1).max(80)).max(40).default([]),
});

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Alleen admin" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  const result = await saveRadarSettings(parsed.data, session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, settings: parsed.data });
}
