import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logSessionActivity } from "@/lib/audit/session-log";
import { runDjFeesSheetSync } from "@/lib/dashboard/dj-fees-sheet-sync";
import { hasDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/dashboard/dj-fees/sync — "Sync nu" on the DJ-fees page. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }

  const run = await runDjFeesSheetSync("manual");
  const result = run.ok ? run.result : null;
  const ok = Boolean(result?.ok);

  await logSessionActivity(session, {
    action: "dj_fee_sheet_sync",
    summary: ok
      ? `DJ-fees gesynchroniseerd uit Google Sheet (${result!.updated + result!.inserted} gewijzigd)`
      : "DJ-fees sync uit Google Sheet mislukt",
    path: "/api/dashboard/dj-fees/sync",
    method: "POST",
    status: ok ? 200 : 502,
    tool: "dashboard",
    meta: result
      ? {
          updated: result.updated,
          inserted: result.inserted,
          released: result.released,
          unmatched: result.unmatched.length,
        }
      : {},
  });

  if (ok) {
    const { invalidateEventInsightsCache } = await import(
      "@/lib/insights/event-insights"
    );
    await invalidateEventInsightsCache();
  }

  if (!result) {
    return NextResponse.json({ error: run.outcome.error ?? "Sync crashte" }, { status: 500 });
  }
  return NextResponse.json(result, { status: ok ? 200 : 502 });
}
