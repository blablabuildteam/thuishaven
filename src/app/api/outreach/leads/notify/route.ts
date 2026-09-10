import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { leads, prospects } from "@/lib/db/schema";
import { notifySalesTeam } from "@/lib/integrations/outreach";

export const dynamic = "force-dynamic";

const schema = z.object({
  prospectId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Geen database" }, { status: 400 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const db = getDb();
  const [lead] = await db
    .select({
      summary: leads.summary,
      companyName: prospects.companyName,
      email: prospects.email,
      outreachEmailId: leads.outreachEmailId,
    })
    .from(leads)
    .innerJoin(prospects, eq(leads.prospectId, prospects.id))
    .where(eq(leads.prospectId, parsed.data.prospectId))
    .limit(1);
  if (!lead) {
    return NextResponse.json({ error: "Geen lead voor dit bedrijf" }, { status: 404 });
  }

  const result = await notifySalesTeam({
    companyName: lead.companyName,
    summary: lead.summary ?? `Warme lead · ${lead.companyName}`,
    email: lead.email ?? undefined,
    prospectId: parsed.data.prospectId,
    outreachEmailId: lead.outreachEmailId ?? undefined,
    persistLead: false,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
