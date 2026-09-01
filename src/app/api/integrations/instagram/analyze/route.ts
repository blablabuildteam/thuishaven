import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzePendingMarketingPosts } from "@/lib/integrations/social/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/integrations/instagram/analyze — Gemini vision op unanalyzed posts. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    limit?: number;
    force?: boolean;
  };

  const result = await analyzePendingMarketingPosts({
    limit: body.limit ?? 8,
    force: body.force === true,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
