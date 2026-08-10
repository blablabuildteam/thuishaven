import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createUser,
  listUsers,
  publicUser,
  setUserActive,
} from "@/lib/auth/users";

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

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige invoer (wachtwoord min. 8 tekens)" },
      { status: 400 },
    );
  }

  const result = await createUser({
    ...parsed.data,
    createdByEmail: gate.session!.user.email!,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ user: publicUser(result.user) }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  // Voorkom dat admin zichzelf deactiveert
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
