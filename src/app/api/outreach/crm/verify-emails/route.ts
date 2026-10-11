import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { getCrmDossier } from "@/lib/outreach/crm";
import { rankMailTargets } from "@/lib/outreach/contact-ranking";
import { verifyProspectEmail } from "@/lib/outreach/email-verify";
import { hasHunterConfig } from "@/lib/integrations/hunter/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ prospectId: z.string().uuid() });

/** Check the mailboxes we'd actually mail (max 3 + algemeen adres). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!hasHunterConfig()) {
    return NextResponse.json({ error: "Hunter niet ingesteld" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { dossier } = await getCrmDossier(parsed.data.prospectId);
  if (!dossier) {
    return NextResponse.json({ error: "Bedrijf niet gevonden" }, { status: 404 });
  }

  const { targets } = rankMailTargets({
    contacts: dossier.contacts,
    company: { website: dossier.website, companyName: dossier.companyName },
    companyEmail: dossier.email,
    checks: dossier.emailChecks,
    max: 4,
  });
  let checked = 0;
  let missed = 0;
  for (const t of targets) {
    const check = await verifyProspectEmail({
      prospectId: dossier.id,
      email: t.email,
    });
    if (check) checked += 1;
    else missed += 1;
  }

  return NextResponse.json({
    ok: true,
    checked,
    ...(missed > 0
      ? { warning: `${missed} adres(sen) niet gecontroleerd (Hunter-tegoed op?)` }
      : {}),
  });
}
