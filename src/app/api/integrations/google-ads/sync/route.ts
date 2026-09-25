import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncGoogleSearchAdsReadOnly } from "@/lib/integrations/google-ads/ads-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/integrations/google-ads/sync — Google Ads Search/PMax/Display → marketing_ads.
 * Body `{ light: true }` = laatste 30 dagen.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const light = await readLightFlag(request);
  const result = await syncGoogleSearchAdsReadOnly(
    light ? { since: null } : undefined,
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
