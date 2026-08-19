import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendAlertTestEmail } from "@/lib/integrations/alerts/notify";
import { resolveAlertRecipients } from "@/lib/integrations/alerts/recipients";

export const dynamic = "force-dynamic";

/**
 * POST — test-alertmail.
 * Ontvangers komen NOOIT uit de request body — alleen uit ALERT_NOTIFY_EMAIL + allowlist.
 * Alleen admins.
 */
export async function POST() {
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

  const gate = resolveAlertRecipients();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: 400 });
  }

  const result = await sendAlertTestEmail();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, to: result.to });
}
