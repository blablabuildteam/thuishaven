import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, hasDatabase } from "@/lib/db/client";
import { externalTicketEvents } from "@/lib/db/schema";
import {
  parseExternalEventDay,
  updateExternalTicketEventSchema,
} from "@/lib/dashboard/external-ticket-events";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
}

function notConfigured() {
  return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
}

function badId() {
  return NextResponse.json({ error: "Ongeldig event" }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Event niet gevonden" }, { status: 404 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!hasDatabase()) return notConfigured();

  const { id } = await params;
  if (!UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const parsed = updateExternalTicketEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" },
      { status: 400 },
    );
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Geen wijzigingen" }, { status: 400 });
  }

  const db = getDb();
  const patch: Partial<typeof externalTicketEvents.$inferInsert> = {};
  if (updates.name != null) patch.name = updates.name;
  if (updates.startsAt != null) patch.startsAt = parseExternalEventDay(updates.startsAt);
  if (updates.expectedAttendees != null) {
    patch.expectedAttendees = updates.expectedAttendees;
  }
  if (updates.scanned !== undefined) patch.scanned = updates.scanned;

  const updated = await db
    .update(externalTicketEvents)
    .set(patch)
    .where(eq(externalTicketEvents.id, id))
    .returning({
      id: externalTicketEvents.id,
      name: externalTicketEvents.name,
      startsAt: externalTicketEvents.startsAt,
      expectedAttendees: externalTicketEvents.expectedAttendees,
      scanned: externalTicketEvents.scanned,
    });

  if (!updated[0]) return notFound();
  return NextResponse.json({ ok: true, event: updated[0] });
}
