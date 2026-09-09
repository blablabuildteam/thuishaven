import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { discoverCompanyProspects } from "@/lib/integrations/kvk";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    naam: z.string().min(2).optional(),
    kvkNummer: z.string().min(8).max(20).optional(),
  })
  .refine((v) => Boolean(v.naam || v.kvkNummer), {
    message: "naam of kvkNummer verplicht",
  });

/**
 * Dry-run KvK lookup — name or KvK number only. Does not insert prospects.
 * POST /api/outreach/kvk/discover
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Zoek alleen op bedrijfsnaam of KvK-nummer." },
      { status: 400 },
    );
  }

  const result = await discoverCompanyProspects({
    naam: parsed.data.naam,
    kvkNummer: parsed.data.kvkNummer,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
