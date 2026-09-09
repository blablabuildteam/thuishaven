import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  applyKvkCandidateToProspect,
  enrichKnownCompany,
  findProspectForKvk,
} from "@/lib/integrations/kvk";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    naam: z.string().min(2).optional(),
    kvkNummer: z.string().min(8).max(20).optional(),
    prospectId: z.string().uuid().optional(),
    apply: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.naam || v.kvkNummer || v.prospectId), {
    message: "naam, kvkNummer of prospectId verplicht",
  });

/**
 * Enrich an already-known company via KvK (name or number only).
 * POST /api/outreach/kvk/enrich
 * { apply: true } writes onto the matched / selected prospect.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Vul een bedrijfsnaam of KvK-nummer in." },
      { status: 400 },
    );
  }

  let naam = parsed.data.naam;
  const prospectMatch = await findProspectForKvk({
    prospectId: parsed.data.prospectId,
    naam,
    kvkNummer: parsed.data.kvkNummer,
  });

  if (!naam && prospectMatch) naam = prospectMatch.companyName;

  const result = await enrichKnownCompany({
    naam,
    kvkNummer: parsed.data.kvkNummer,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  if (!parsed.data.apply) {
    return NextResponse.json({
      ok: true,
      applied: false,
      candidate: result.candidate,
      matchedProspect: prospectMatch,
    });
  }

  if (!prospectMatch) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Geen bestaande prospect om te verrijken. KvK mag geen nieuwe doelgroep aanmaken.",
        candidate: result.candidate,
      },
      { status: 400 },
    );
  }

  const applied = await applyKvkCandidateToProspect(
    prospectMatch.id,
    result.candidate,
  );
  if (!applied.ok) {
    return NextResponse.json(applied, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    applied: true,
    candidate: result.candidate,
    matchedProspect: prospectMatch,
  });
}
