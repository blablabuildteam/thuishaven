import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb, hasDatabase } from "@/lib/db/client";
import { externalTicketEvents } from "@/lib/db/schema";
import {
  createExternalTicketEventSchema,
  parseExternalEventDay,
} from "@/lib/dashboard/external-ticket-events";

export const dynamic = "force-dynamic";

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

  const parsed = createExternalTicketEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" },
      { status: 400 },
    );
  }

  const { name, startsAt, expectedAttendees } = parsed.data;
  const db = getDb();
  const inserted = await db
    .insert(externalTicketEvents)
    .values({
      name,
      startsAt: parseExternalEventDay(startsAt),
      expectedAttendees,
    })
    .returning({
      id: externalTicketEvents.id,
      name: externalTicketEvents.name,
      startsAt: externalTicketEvents.startsAt,
      expectedAttendees: externalTicketEvents.expectedAttendees,
    });

  return NextResponse.json({ ok: true, event: inserted[0] });
}
