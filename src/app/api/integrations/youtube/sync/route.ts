import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncYouTubeReadOnly } from "@/lib/integrations/youtube/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/integrations/youtube/sync — read-only uploads → marketing_posts.
 * Body `{ light: true }` skips Gemini + only refreshes newest 24.
 * Full sync pulls ~6 months of history.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const light = await readLightFlag(request);
  const result = await syncYouTubeReadOnly(
    light
      ? { limit: 24, since: null, withAnalyze: false }
      : { withAnalyze: true },
  );
  return NextResponse.json(
    { readOnly: true, light, ...result },
    { status: result.ok ? 200 : 502 },
  );
}

async function readLightFlag(request: Request): Promise<boolean> {
  try {
    const json = (await request.json()) as { light?: unknown };
    return json?.light === true;
  } catch {
    return false;
  }
}
