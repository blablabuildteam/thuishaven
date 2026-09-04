import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { discoverCompanyProspects } from "@/lib/integrations/kvk";

export const dynamic = "force-dynamic";

const schema = z.object({
  city: z.string().min(2).optional(),
  naam: z.string().min(2).optional(),
  minEmployees: z.number().int().min(1).optional(),
  maxEmployees: z.number().int().min(1).optional(),
  jubileeOnly: z.boolean().optional(),
  maxEnrich: z.number().int().min(1).max(80).optional(),
});

/**
 * Dry-run KvK discovery — returns candidates, does not insert prospects.
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
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const result = await discoverCompanyProspects({
    places: parsed.data.city ? [parsed.data.city] : undefined,
    naam: parsed.data.naam,
    minEmployees: parsed.data.minEmployees,
    maxEmployees: parsed.data.maxEmployees,
    jubileeOnly: parsed.data.jubileeOnly,
    maxEnrich: parsed.data.maxEnrich ?? 20,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
