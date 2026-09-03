import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  updateDeurverkoopSchema,
  upsertDeurverkoop,
} from "@/lib/dashboard/deurverkoop";
import { hasDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ editionId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }

  const { editionId } = await params;
  if (!UUID_RE.test(editionId)) {
    return NextResponse.json({ error: "Ongeldige editie" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const parsed = updateDeurverkoopSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" },
      { status: 400 },
    );
  }

  const result = await upsertDeurverkoop(editionId, parsed.data.sold);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    const error =
      result.error === "not_found"
        ? "Editie niet gevonden"
        : "Deurverkoop kan alleen bij Weeztix-edities";
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ ok: true, sold: result.sold });
}
