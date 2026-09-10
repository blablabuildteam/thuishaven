import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { enrichCompanyProspectsBatch } from "@/lib/integrations/kvk/batch-enrich";

export const dynamic = "force-dynamic";

const schema = z.object({
  limit: z.number().int().min(1).max(15).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const result = await enrichCompanyProspectsBatch(
    parsed.success ? (parsed.data.limit ?? 10) : 10,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
