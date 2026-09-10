import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { fillCompanyWebsiteEmails } from "@/lib/outreach/website-email";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";

const schema = z.object({
  limit: z.number().int().min(1).max(8).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const result = await fillCompanyWebsiteEmails(parsed.data.limit ?? 8);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await logSessionActivity(session, {
    action: "website_email",
    summary: `Site/generieke mails: ${result.filled}/${result.processed}`,
    path: "/api/outreach/website-email",
    method: "POST",
    status: 200,
    tool: "outreach",
    meta: { filled: result.filled, processed: result.processed },
  });
  return NextResponse.json(result);
}
