import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sendAlertTestEmail } from "@/lib/integrations/alerts/notify";
import { resolveAlertRecipients } from "@/lib/integrations/alerts/recipients";
import { getAlertRule } from "@/lib/integrations/alerts/rules";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ruleId: z.string().uuid().optional(),
});

/**
 * POST — test-alertmail.
 * Ontvangers komen uit de gekozen regel (of env-fallback), altijd via allowlist.
 * Alleen admins.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Alleen admins mogen testmails versturen" },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const ruleId = parsed.success ? parsed.data.ruleId : undefined;
  let recipients: string[] | undefined;
  if (ruleId) {
    const rule = await getAlertRule(ruleId);
    if (!rule) {
      return NextResponse.json({ error: "Alert niet gevonden" }, { status: 404 });
    }
    recipients = rule.recipients;
  }

  const gate = resolveAlertRecipients(recipients);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: 400 });
  }

  const result = await sendAlertTestEmail(recipients);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, to: result.to });
}
