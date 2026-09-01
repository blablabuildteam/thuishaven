import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { linkPostsToEditions } from "@/lib/marketing/edition-link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/integrations/social/link-editions — heuristisch posts → edities. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    persist?: boolean;
    limit?: number;
  };

  const result = await linkPostsToEditions({
    persist: body.persist !== false,
    limit: body.limit ?? 80,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
