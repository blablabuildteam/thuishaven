import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logSessionActivity } from "@/lib/audit/session-log";
import { formatHorecaInput } from "@/lib/dashboard/horeca-amounts";
import {
  updateHorecaRevenue,
  updateHorecaRevenueSchema,
} from "@/lib/dashboard/horeca-revenue";
import { hasDatabase } from "@/lib/db/client";
import { displayEditionName } from "@/lib/editions/lineup";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function euroLabel(cents: number | null): string {
  return cents == null ? "—" : `€ ${formatHorecaInput(cents)}`;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ editionId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }

  const { editionId } = await params;
  if (!UUID_RE.test(editionId)) {
    return NextResponse.json({ error: "Ongeldige editie" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const parsed = updateHorecaRevenueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" },
      { status: 400 },
    );
  }

  const result = await updateHorecaRevenue(
    editionId,
    parsed.data,
    session.user.email ?? null,
  );
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    const error =
      result.error === "not_found"
        ? "Editie niet gevonden"
        : "Omzet kan alleen bij ticketevents";
    return NextResponse.json({ error }, { status });
  }

  const name = displayEditionName(result.name);
  await logSessionActivity(session, {
    action: "horeca_revenue_update",
    summary: `Omzet ${name}: bar ${euroLabel(result.barCents)}, keuken ${euroLabel(result.kitchenCents)}`,
    path: `/api/dashboard/editions/${editionId}/omzet`,
    method: "PATCH",
    status: 200,
    tool: "dashboard",
    meta: {
      editionId,
      barCents: result.barCents,
      kitchenCents: result.kitchenCents,
    },
  });

  return NextResponse.json({
    ok: true,
    barCents: result.barCents,
    kitchenCents: result.kitchenCents,
  });
}
