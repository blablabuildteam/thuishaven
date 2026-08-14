import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { linkCampaignsToEditions } from "@/lib/editions/link-campaigns";

export const dynamic = "force-dynamic";

/** Koppelt Brevo-campagnes heuristisch aan edities. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await linkCampaignsToEditions({ persist: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
