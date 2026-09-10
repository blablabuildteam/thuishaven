import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { saveLinkedinEstimate } from "@/lib/outreach/crm";

export const dynamic = "force-dynamic";

const schema = z.object({
  prospectId: z.string().uuid(),
  estimate: z.number().int().min(1).max(1_000_000),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Vul een LinkedIn-schatting in (heel getal)." },
      { status: 400 },
    );
  }

  const result = await saveLinkedinEstimate({
    prospectId: parsed.data.prospectId,
    estimate: parsed.data.estimate,
    linkedinUrl: parsed.data.linkedinUrl || null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
