import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUsageSummary, recordUsage } from "@/lib/usage/store";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sinceDays = Number(searchParams.get("days") ?? "30");
  const summary = await getUsageSummary({
    sinceDays: Number.isFinite(sinceDays) ? sinceDays : 30,
    tool: "outreach",
  });
  return NextResponse.json(summary);
}

const postSchema = z.object({
  vendor: z.enum([
    "openai",
    "anthropic",
    "brevo",
    "kvk",
    "google_places",
    "enrichment",
    "other",
  ]),
  operation: z.string().min(1),
  units: z.number().positive(),
  unitLabel: z.string().optional(),
  costEurCents: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** Handmatig / interne logging (admins). Live adapters gaan later recordUsage direct aanroepen. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Alleen admins" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const event = await recordUsage({
    tool: "outreach",
    ...parsed.data,
  });
  return NextResponse.json({ event }, { status: 201 });
}
