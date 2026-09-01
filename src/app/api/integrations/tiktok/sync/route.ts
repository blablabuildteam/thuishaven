import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncTikTokReadOnly } from "@/lib/integrations/tiktok/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/integrations/tiktok/sync — read-only videos → marketing_posts.
 * Body `{ light: true }` skips Gemini vision for faster view refresh.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const light = await readLightFlag(request);
  const result = await syncTikTokReadOnly({
    limit: light ? 24 : 40,
    withAnalyze: !light,
  });
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
