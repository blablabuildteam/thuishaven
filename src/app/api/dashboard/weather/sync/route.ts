import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncWeatherRange, seedExternalEventsIfEmpty } from "@/lib/weather/store";
import { z } from "zod";

export const dynamic = "force-dynamic";

function isoDaysBack(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const schema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige datums" }, { status: 400 });
  }

  const endDate = parsed.data.endDate ?? isoDaysBack(0);
  const startDate = parsed.data.startDate ?? isoDaysBack(13);

  try {
    const seeded = await seedExternalEventsIfEmpty();
    const result = await syncWeatherRange({ startDate, endDate });
    return NextResponse.json({
      ok: true,
      startDate,
      endDate,
      upserted: result.upserted,
      fetched: result.rows.length,
      festivalsSeeded: seeded,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync mislukt" },
      { status: 500 },
    );
  }
}
