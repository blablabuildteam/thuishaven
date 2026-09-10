import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fillPublicHeadcounts } from "@/lib/outreach/public-headcount";

export const dynamic = "force-dynamic";

/** Fill public (Wikidata) employee estimates for odd/missing KvK counts. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await fillPublicHeadcounts({ onlyOffKvk: true, limit: 25 });
  return NextResponse.json(result);
}
