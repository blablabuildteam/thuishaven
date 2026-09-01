import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncResidentAdvisorReadOnly } from "@/lib/integrations/ra/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/integrations/ra/sync — read-only listings voor club 109027. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await syncResidentAdvisorReadOnly();
  if (result.ok) {
    const { invalidateEventInsightsCache } = await import(
      "@/lib/insights/event-insights"
    );
    await invalidateEventInsightsCache();
  }
  return NextResponse.json(
    { readOnly: true, ...result },
    { status: result.ok ? 200 : 502 },
  );
}
