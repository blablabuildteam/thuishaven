import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  hasApolloConfig,
  searchDoelgroepCompanies,
} from "@/lib/integrations/apollo/client";
import {
  APOLLO_EMPLOYEE_RANGES,
  DEFAULT_APOLLO_CRITERIA,
  criteriaSummary,
  keepForIntake,
  normalizeCriteria,
  placePresetLabel,
  placesForPreset,
  splitByRegion,
} from "@/lib/integrations/apollo/criteria";
import { addProspects } from "@/lib/outreach/intake";
import {
  nextApolloDiscoverPage,
  rememberApolloPage,
} from "@/lib/outreach/apollo-page";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";

const criteriaSchema = z
  .object({
    employeeRanges: z.array(z.string()).max(8).optional(),
    placePreset: z.enum(["ring", "kern", "amsterdam"]).optional(),
    keywordTags: z.array(z.string()).max(8).optional(),
  })
  .optional();

const schema = z.object({
  apply: z.boolean().optional(),
  page: z.number().int().min(1).max(40).optional(),
  criteria: criteriaSchema,
});

export async function GET() {
  const nextPage = await nextApolloDiscoverPage();
  const criteria = DEFAULT_APOLLO_CRITERIA;
  return NextResponse.json({
    configured: hasApolloConfig(),
    nextPage,
    criteria,
    employeeRangeOptions: APOLLO_EMPLOYEE_RANGES,
    placePresets: [
      {
        id: "ring",
        label: placePresetLabel("ring"),
        placeCount: placesForPreset("ring").length,
      },
      {
        id: "kern",
        label: placePresetLabel("kern"),
        placeCount: placesForPreset("kern").length,
      },
      {
        id: "amsterdam",
        label: placePresetLabel("amsterdam"),
        placeCount: 1,
      },
    ],
    hint: hasApolloConfig()
      ? `POST { apply: true } haalt pagina ${nextPage} (1 Apollo-credit). apply:false telt matches zonder te bewaren.`
      : "Zet APOLLO_API_KEY in Vercel / .env.local",
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const criteria = normalizeCriteria(parsed.data.criteria);
  const page = parsed.data.page ?? (await nextApolloDiscoverPage());
  const search = await searchDoelgroepCompanies({
    page,
    perPage: 100,
    criteria,
  });
  if (!search.ok) {
    return NextResponse.json({ error: search.error }, { status: 400 });
  }

  const split = splitByRegion(search.companies);
  const keep = keepForIntake(search.companies);

  if (!parsed.data.apply) {
    return NextResponse.json({
      ok: true,
      applied: false,
      creditUsed: 1,
      total: search.total,
      page: search.page,
      criteria: search.criteria,
      criteriaLabel: criteriaSummary(search.criteria),
      pageRaw: search.companies.length,
      pageInRegion: split.inRegion.length,
      pageOutOfRegion: split.outOfRegion.length,
      pageUnknownCity: split.unknownCity.length,
      pageKeep: keep.length,
      droppedSample: split.outOfRegion.slice(0, 8).map((c) => ({
        name: c.name,
        city: c.city ?? null,
      })),
      keepSample: keep.slice(0, 12).map((c) => ({
        name: c.name,
        city: c.city ?? null,
        employeeCount: c.employeeCount ?? null,
      })),
      note: "Apollo-totaal is vóór onze regio-hardfilter. We bewaren alleen in-regio (+ onbekende plaats).",
    });
  }

  const result = await addProspects({
    type: "company",
    source: "apollo",
    drafts: keep.map((c) => ({
      companyName: c.name,
      website: c.website ?? null,
      linkedinUrl: c.linkedinUrl ?? null,
      city: c.city ?? null,
      employeeCount: c.employeeCount ?? null,
      sector: c.industry ?? null,
      apolloPage: search.page,
    })),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await rememberApolloPage(
    search.page,
    search.companies.map((c) => c.name),
  );

  await logSessionActivity(session, {
    action: "apollo_discover",
    summary: `Apollo pagina ${search.page}: ${result.created} nieuw · ${split.outOfRegion.length} buiten regio overgeslagen`,
    path: "/api/outreach/discover",
    method: "POST",
    status: 200,
    tool: "outreach",
    meta: {
      page: search.page,
      created: result.created,
      duplicate: result.duplicate,
      total: search.total,
      outOfRegion: split.outOfRegion.length,
      criteria: search.criteria,
    },
  });

  return NextResponse.json({
    applied: true,
    total: search.total,
    page: search.page,
    nextPage: search.page + 1,
    criteria: search.criteria,
    criteriaLabel: criteriaSummary(search.criteria),
    pageOutOfRegion: split.outOfRegion.length,
    pageKeep: keep.length,
    ...result,
  });
}
