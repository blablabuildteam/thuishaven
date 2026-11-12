import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { hasDatabase } from "@/lib/db/client";
import { setPartyStatus } from "@/lib/radar/ingest-party";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["published", "needs_review", "rejected"]),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  const result = await setPartyStatus(id, parsed.data.status);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
