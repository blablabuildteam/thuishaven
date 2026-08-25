import { NextResponse } from "next/server";
import { peekAuthToken } from "@/lib/auth/tokens";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token ontbreekt" }, { status: 400 });
  }

  const result = await peekAuthToken(token, "password_reset");
  if (!result.ok) {
    const message =
      result.error === "expired"
        ? "Resetlink verlopen"
        : result.error === "used"
          ? "Resetlink al gebruikt"
          : "Ongeldige resetlink";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    email: result.userEmail,
    name: result.userName,
  });
}
