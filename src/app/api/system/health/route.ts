import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSystemHealth } from "@/lib/system/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/system/health
 * Integration health for the app-wide notice and per-page warnings.
 * Everyone sees what is affected; only admins get the technical detail
 * and what to do about it.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const isAdmin = session.user.role === "admin";
  const health = await getSystemHealth();

  return NextResponse.json({
    ...health,
    issues: isAdmin
      ? health.issues
      : health.issues.map((issue) => ({
          ...issue,
          detail: undefined,
          action: undefined,
        })),
  });
}
