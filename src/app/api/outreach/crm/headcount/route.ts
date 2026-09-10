import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/** Wikidata is not a targeting source. Use Apollo + KvK. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  return NextResponse.json(
    { error: "Wikidata-headcount is uit. Haal de doelgroep via Apollo." },
    { status: 410 },
  );
}
