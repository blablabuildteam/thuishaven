import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listStoredDashboardAlerts } from "@/lib/integrations/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const rows = await listStoredDashboardAlerts();
  return NextResponse.json({
    notifications: rows.map((row) => ({
      id: row.id,
      type: row.type,
      ruleId: row.ruleId,
      title: row.title,
      message: row.message,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      notifiedAt: row.notifiedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    })),
  });
}
