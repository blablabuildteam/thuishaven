import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { countPendingHorecaEvents } from "@/lib/dashboard/horeca-revenue";
import { hasDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ count: 0 });
  }

  const count = await countPendingHorecaEvents();
  return NextResponse.json({ count });
}
