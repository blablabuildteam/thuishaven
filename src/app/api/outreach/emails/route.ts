import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { generateAndStoreDraft } from "@/lib/integrations/outreach";
import { OUTREACH_VARIANTS } from "@/lib/outreach/tone";

export const dynamic = "force-dynamic";

const generateSchema = z.object({
  prospectId: z.string().uuid(),
  variantId: z
    .enum(["warm_tour", "open_dates", "jubileum", "short_checkin"])
    .optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  return NextResponse.json({ variants: OUTREACH_VARIANTS });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action as string | undefined;

  if (action === "send") {
    return NextResponse.json(
      {
        error:
          "Versturen staat uit. Review eerst /outreach/planning. Zet later OUTREACH_SEND_ENABLED=true + BREVO_OUTREACH_API_KEY.",
      },
      { status: 403 },
    );
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const result = await generateAndStoreDraft(parsed.data);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}
