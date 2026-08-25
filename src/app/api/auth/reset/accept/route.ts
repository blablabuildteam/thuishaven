import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { setUserPassword } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Wachtwoord minimaal 8 tekens" },
      { status: 400 },
    );
  }

  const consumed = await consumeAuthToken(parsed.data.token, "password_reset");
  if (!consumed.ok) {
    const message =
      consumed.error === "expired"
        ? "Resetlink verlopen — vraag een nieuwe aan"
        : consumed.error === "used"
          ? "Resetlink al gebruikt"
          : "Ongeldige resetlink";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = await setUserPassword({
    userId: consumed.userId,
    password: parsed.data.password,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
