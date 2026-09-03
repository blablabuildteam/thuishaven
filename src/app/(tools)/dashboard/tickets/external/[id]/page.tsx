import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ExternalTicketEventForm } from "@/components/dashboard/external-ticket-event-form";
import { SectionHeader } from "@/components/ui/section-header";
import { getDb, hasDatabase } from "@/lib/db/client";
import { externalTicketEvents } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasDatabase() || !UUID_RE.test(id)) {
    return { title: "Extern event" };
  }
  const db = getDb();
  const row = await db
    .select({ name: externalTicketEvents.name })
    .from(externalTicketEvents)
    .where(eq(externalTicketEvents.id, id))
    .limit(1);
  return { title: row[0]?.name ?? "Extern event" };
}

export default async function ExternalTicketEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasDatabase() || !UUID_RE.test(id)) notFound();

  const db = getDb();
  const rows = await db
    .select({
      id: externalTicketEvents.id,
      name: externalTicketEvents.name,
      startsAt: externalTicketEvents.startsAt,
      expectedAttendees: externalTicketEvents.expectedAttendees,
      scanned: externalTicketEvents.scanned,
    })
    .from(externalTicketEvents)
    .where(eq(externalTicketEvents.id, id))
    .limit(1);

  const event = rows[0];
  if (!event) notFound();

  return (
    <div>
      <p className="mb-4 text-sm text-text-muted">
        <Link href="/dashboard/tickets" className="hover:underline">
          ← Tickets
        </Link>
      </p>
      <SectionHeader
        eyebrow="Extern event"
        title={event.name}
        description={event.startsAt.toLocaleDateString("nl-NL", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      />

      <ExternalTicketEventForm
        event={{
          id: event.id,
          name: event.name,
          startsAt: event.startsAt.toISOString(),
          expectedAttendees: event.expectedAttendees,
          scanned: event.scanned,
        }}
      />
    </div>
  );
}
