import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  createDueFollowUpDrafts,
  listFollowUpQueue,
} from "@/lib/outreach/follow-up";

export const dynamic = "force-dynamic";

const schema = z.object({
  apply: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  return NextResponse.json(await listFollowUpQueue());
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  if (!parsed.data.apply) {
    return NextResponse.json(await listFollowUpQueue());
  }
  const result = await createDueFollowUpDrafts(parsed.data.limit ?? 10);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
