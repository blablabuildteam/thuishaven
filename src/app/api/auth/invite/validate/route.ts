import { NextResponse } from "next/server";
import { peekAuthToken } from "@/lib/auth/tokens";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token ontbreekt" }, { status: 400 });
  }

  const result = await peekAuthToken(token, "invite");
  if (!result.ok) {
    const message =
      result.error === "expired"
        ? "Uitnodiging verlopen"
        : result.error === "used"
          ? "Uitnodiging al gebruikt"
          : "Ongeldige uitnodiging";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    email: result.userEmail,
    name: result.userName,
  });
}
