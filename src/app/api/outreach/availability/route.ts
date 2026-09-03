import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  deleteAvailabilityDay,
  listAvailabilityDays,
  upsertAvailabilityDay,
} from "@/lib/outreach/availability";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const data = await listAvailabilityDays();
  return NextResponse.json(data);
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum([
    "available",
    "booked_external",
    "own_event",
    "closed",
    "hold",
  ]),
  dayPart: z.enum(["day", "evening", "full"]).optional(),
  label: z.string().nullable().optional(),
  priceFrom: z.number().nullable().optional(),
  priceNote: z.string().nullable().optional(),
  areas: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  try {
    const day = await upsertAvailabilityDay(parsed.data);
    return NextResponse.json({ day }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Opslaan mislukt" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id verplicht" }, { status: 400 });
  }
  try {
    await deleteAvailabilityDay(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verwijderen mislukt" },
      { status: 500 },
    );
  }
}
