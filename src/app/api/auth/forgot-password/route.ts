import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/lib/auth/mail";
import {
  findUserByEmailIncludingInactive,
  isUserLoginReady,
} from "@/lib/auth/users";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const user = await findUserByEmailIncludingInactive(parsed.data.email);
  if (user && isUserLoginReady(user)) {
    const { rawToken } = await createAuthToken({
      userId: user.id,
      type: "password_reset",
    });
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      rawToken,
    });
  }

  return NextResponse.json({
    ok: true,
    message:
      "Als dit e-mailadres bij ons bekend is, ontvang je een resetlink.",
  });
}
