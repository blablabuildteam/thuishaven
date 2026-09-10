import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listActivityEvents } from "@/lib/audit/activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Alleen admin" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tool = searchParams.get("tool") ?? undefined;
  const userEmail = searchParams.get("email") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? "100");

  const rows = await listActivityEvents({
    limit: Number.isFinite(limit) ? limit : 100,
    tool: tool || undefined,
    userEmail: userEmail || undefined,
    sinceDays: 30,
  });

  return NextResponse.json({ rows });
}
