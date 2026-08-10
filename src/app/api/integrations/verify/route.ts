import { NextResponse } from "next/server";
import { z } from "zod";
import {
  verifyAllIntegrations,
  verifyIntegration,
} from "@/lib/integrations/verify";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().optional(),
});

export async function POST(request: Request) {
  let id: string | undefined;
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
    }
    id = parsed.data.id;
  } catch {
    // empty body = verify all
  }

  if (id) {
    const result = await verifyIntegration(id);
    return NextResponse.json({ results: [result] });
  }

  const results = await verifyAllIntegrations();
  return NextResponse.json({ results });
}
