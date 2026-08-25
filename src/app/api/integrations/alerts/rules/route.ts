import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createAlertRule,
  deleteAlertRule,
  ensureDefaultAlertRule,
  listAlertRules,
  updateAlertRule,
} from "@/lib/integrations/alerts/rules";
import { refreshDashboardAlerts } from "@/lib/integrations/alerts";

export const dynamic = "force-dynamic";

async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Niet ingelogd" }, { status: 401 }),
    };
  }
  return { session };
}

export async function GET() {
  const gate = await requireUser();
  if ("error" in gate && gate.error) return gate.error;
  await ensureDefaultAlertRule().catch(() => null);
  const rules = await listAlertRules();
  return NextResponse.json({ rules });
}

const bodySchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  recipients: z.union([z.string(), z.array(z.string())]),
  soldThreshold: z.number().int().positive().nullable().optional(),
  checkRa: z.boolean().optional(),
  checkTicketswap: z.boolean().optional(),
  checkAppic: z.boolean().optional(),
});

export async function POST(request: Request) {
  const gate = await requireUser();
  if ("error" in gate && gate.error) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  try {
    const rule = await createAlertRule(
      parsed.data,
      gate.session.user.email ?? null,
    );
    await refreshDashboardAlerts().catch(() => null);
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Opslaan mislukt" },
      { status: 400 },
    );
  }
}

const patchSchema = bodySchema.partial().extend({
  id: z.string().uuid(),
});

export async function PATCH(request: Request) {
  const gate = await requireUser();
  if ("error" in gate && gate.error) return gate.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const { id, ...input } = parsed.data;
  try {
    const rule = await updateAlertRule(id, input);
    if (!rule) {
      return NextResponse.json({ error: "Alert niet gevonden" }, { status: 404 });
    }
    await refreshDashboardAlerts().catch(() => null);
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bijwerken mislukt" },
      { status: 400 },
    );
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: Request) {
  const gate = await requireUser();
  if ("error" in gate && gate.error) return gate.error;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const ok = await deleteAlertRule(parsed.data.id);
  if (!ok) {
    return NextResponse.json({ error: "Alert niet gevonden" }, { status: 404 });
  }
  await refreshDashboardAlerts().catch(() => null);
  return NextResponse.json({ ok: true });
}
