import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  listRadarAlerts,
  markAllRadarAlertsRead,
  markRadarAlertRead,
} from "@/lib/radar/alerts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const unreadOnly =
    new URL(request.url).searchParams.get("unread") === "1";
  const alerts = await listRadarAlerts({ unreadOnly, limit: 80 });
  return NextResponse.json({ alerts });
}

const patchSchema = z.union([
  z.object({ id: z.string().uuid(), read: z.literal(true) }),
  z.object({ all: z.literal(true) }),
]);

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  if ("all" in parsed.data) {
    const result = await markAllRadarAlertsRead();
    return NextResponse.json(result);
  }
  const result = await markRadarAlertRead(parsed.data.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
