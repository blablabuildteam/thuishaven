import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { addProspects, parseProspectPaste } from "@/lib/outreach/intake";

export const dynamic = "force-dynamic";

const singleSchema = z.object({
  mode: z.literal("single").optional(),
  companyName: z.string().min(2),
  type: z.enum(["agency", "company"]),
  source: z.enum(["manual", "paste", "linkedin"]).optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

const pasteSchema = z.object({
  mode: z.literal("paste"),
  text: z.string().min(2).max(20_000),
  type: z.enum(["agency", "company"]),
  source: z.enum(["manual", "paste", "linkedin"]).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "paste" ? "paste" : "single";

  if (mode === "paste") {
    const parsed = pasteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Plak minstens één bedrijfsnaam (één per regel)." },
        { status: 400 },
      );
    }
    const drafts = parseProspectPaste(parsed.data.text);
    if (drafts.length === 0) {
      return NextResponse.json(
        { error: "Geen namen herkend. Eén bedrijf per regel, optioneel + e-mail." },
        { status: 400 },
      );
    }
    const result = await addProspects({
      drafts,
      type: parsed.data.type,
      source: parsed.data.source ?? "paste",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  }

  const parsed = singleSchema.safeParse({ ...body, mode: "single" });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Vul minimaal een bedrijfsnaam in." },
      { status: 400 },
    );
  }

  const result = await addProspects({
    drafts: [
      {
        companyName: parsed.data.companyName,
        email: parsed.data.email || null,
        website: parsed.data.website || null,
        notes: parsed.data.notes || null,
      },
    ],
    type: parsed.data.type,
    source: parsed.data.source ?? "manual",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (result.created === 0) {
    const first = result.rows[0];
    return NextResponse.json(
      { error: first?.reason ?? "Niet toegevoegd", ...result },
      { status: 400 },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
