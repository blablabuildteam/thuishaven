import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { hasDatabase } from "@/lib/db/client";
import {
  getVenueSourceConfig,
  upsertVenueSourceConfig,
} from "@/lib/radar/parties";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const config = await getVenueSourceConfig(id);
  return NextResponse.json({ config });
}

const patchSchema = z.object({
  websiteProgramUrl: z.string().max(1000).nullable().optional(),
  instagramHandle: z.string().max(120).nullable().optional(),
  enabled: z.boolean().optional(),
  websiteSelectors: z
    .object({
      eventBlockPattern: z.string().optional(),
      titlePattern: z.string().optional(),
      datePattern: z.string().optional(),
      lineupPattern: z.string().optional(),
      nameSplitPattern: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL ontbreekt" }, { status: 503 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }
  const result = await upsertVenueSourceConfig({
    venueId: id,
    ...parsed.data,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ config: result.config });
}
