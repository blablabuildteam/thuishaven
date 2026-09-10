import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { logActivity, toolFromPath } from "@/lib/audit/activity";

export const dynamic = "force-dynamic";

const schema = z.object({
  path: z.string().min(1).max(500),
  action: z.enum(["page_view", "ui_action"]).default("page_view"),
  summary: z.string().max(500).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** Silent activity beacon from tools UI. Any logged-in user. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  // Never log admin activity pages themselves as member-visible noise is fine,
  // but skip auth password paths.
  if (
    parsed.data.path.startsWith("/api/auth") ||
    parsed.data.path.includes("password")
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const summary =
    parsed.data.summary ??
    (parsed.data.action === "page_view"
      ? `Pagina bekeken · ${parsed.data.path}`
      : `UI-actie · ${parsed.data.path}`);

  await logActivity({
    userId: session.user.id,
    userEmail: session.user.email,
    userName: session.user.name,
    tool: toolFromPath(parsed.data.path),
    action: parsed.data.action,
    summary,
    path: parsed.data.path,
    method: "GET",
    status: 200,
    meta: parsed.data.meta,
  });

  return NextResponse.json({ ok: true });
}
