import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  syncWeatherRange,
  seedExternalEventsIfEmpty,
  syncWeatherForEditionDays,
  upsertCuratedExternalEvents,
} from "@/lib/weather/store";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isoDaysBack(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * POST /api/dashboard/weather/sync
 * { mode: "eventDays" } — weer alleen op Thuishaven-eventdagen (historisch)
 * { mode: "range", startDate, endDate } — kalenderbereik
 * { seedFestivals: true } — curated concurrenten toevoegen
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const schema = z.object({
    mode: z.enum(["eventDays", "range"]).optional().default("range"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    seedFestivals: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }

  try {
    let festivalsSeeded = 0;
    if (parsed.data.seedFestivals) {
      festivalsSeeded = await upsertCuratedExternalEvents();
    } else {
      festivalsSeeded = await seedExternalEventsIfEmpty();
    }

    if (parsed.data.mode === "eventDays") {
      const result = await syncWeatherForEditionDays();
      return NextResponse.json({
        mode: "eventDays",
        ...result,
        festivalsSeeded,
      });
    }

    const endDate = parsed.data.endDate ?? isoDaysBack(0);
    const startDate = parsed.data.startDate ?? isoDaysBack(13);
    const result = await syncWeatherRange({ startDate, endDate });
    return NextResponse.json({
      ok: true,
      mode: "range",
      startDate,
      endDate,
      upserted: result.upserted,
      fetched: result.rows.length,
      festivalsSeeded,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync mislukt" },
      { status: 500 },
    );
  }
}
