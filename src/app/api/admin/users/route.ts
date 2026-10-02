import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  inviteUser,
  listUsers,
  publicUser,
  resendInvite,
  setUserActive,
  setUserToolAccess,
  createUserWithPassword,
} from "@/lib/auth/users";
import { DEFAULT_TOOL_ACCESS } from "@/lib/auth/tool-access";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Niet ingelogd" }, { status: 401 }) };
  }
  if (session.user.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Alleen admins kunnen gebruikers beheren" },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const users = await listUsers();
  return NextResponse.json({
    users: users.map(publicUser),
  });
}

const toolAccessSchema = z.object({
  dashboard: z.boolean(),
  outreach: z.boolean(),
  dashboardAreas: z.object({
    overzicht: z.boolean(),
    omzet: z.boolean(),
    marketing: z.boolean(),
  }),
  outreachAreas: z.object({
    stappen: z.boolean(),
    uitleg: z.boolean(),
  }),
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["admin", "member"]).default("member"),
  password: z.string().min(8).optional(),
  toolAccess: toolAccessSchema.optional(),
});

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const toolAccess = parsed.data.toolAccess ?? DEFAULT_TOOL_ACCESS;
  const allowDevPassword =
    process.env.AUTH_ALLOW_ADMIN_PASSWORD === "true" && parsed.data.password;

  const result = allowDevPassword
    ? await createUserWithPassword({
        email: parsed.data.email,
        name: parsed.data.name,
        password: parsed.data.password!,
        role: parsed.data.role,
        createdByEmail: gate.session!.user.email!,
        toolAccess,
      })
    : await inviteUser({
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        createdByEmail: gate.session!.user.email!,
        toolAccess,
      });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ user: publicUser(result.user) }, { status: 201 });
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("toggle_active"),
    id: z.string().uuid(),
    active: z.boolean(),
  }),
  z.object({
    action: z.literal("resend_invite"),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("set_tool_access"),
    id: z.string().uuid(),
    toolAccess: toolAccessSchema,
  }),
]);

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  if (parsed.data.action === "resend_invite") {
    const result = await resendInvite(
      parsed.data.id,
      gate.session!.user.email!,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ user: publicUser(result.user) });
  }

  if (parsed.data.action === "set_tool_access") {
    const result = await setUserToolAccess(
      parsed.data.id,
      parsed.data.toolAccess,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      user: publicUser(result.user),
      note: "Gebruiker moet opnieuw inloggen om de nieuwe toegang te zien.",
    });
  }

  if (
    parsed.data.id === gate.session!.user.id &&
    parsed.data.active === false
  ) {
    return NextResponse.json(
      { error: "Je kunt jezelf niet deactiveren" },
      { status: 400 },
    );
  }

  const result = await setUserActive(parsed.data.id, parsed.data.active);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
