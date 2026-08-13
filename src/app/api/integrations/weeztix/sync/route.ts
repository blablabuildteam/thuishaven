import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncWeeztixReadOnly } from "@/lib/integrations/weeztix/sync";

export const dynamic = "force-dynamic";

/**
 * Read-only sync: GET op Weeztix, write alleen naar onze Neon-DB.
 * Geen create/update/delete op Weeztix.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await syncWeeztixReadOnly();
  return NextResponse.json(
    {
      readOnly: true,
      policy: "Alleen GET naar Weeztix; persistence alleen in onze database",
      ...result,
    },
    { status: result.ok ? 200 : 502 },
  );
}
