import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * Start Weeztix OAuth (authorization code).
 * Alleen voor ingelogde admins. Leidt naar login.weeztix.com.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Alleen admins" }, { status: 403 });
  }

  const clientId = process.env.WEEZTIX_CLIENT_ID?.trim();
  const redirectUri =
    process.env.WEEZTIX_REDIRECT_URI?.trim() ||
    `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"}/api/integrations/weeztix/callback`;

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "WEEZTIX_CLIENT_ID ontbreekt in .env.local — vul die in na het aanmaken van de OAuth-client",
      },
      { status: 400 },
    );
  }

  const state = crypto.randomUUID();
  const url = new URL("https://login.weeztix.com/login");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  // docs gebruiken soms redirect_url
  url.searchParams.set("redirect_url", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("weeztix_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
