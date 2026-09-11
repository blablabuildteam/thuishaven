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
  getApolloUniverseSnapshot,
  nextApolloDiscoverPage,
  rememberApolloPage,
  rememberApolloUniverse,
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
  /** Alleen Apollo-totaal ophalen (per_page=1, 1 credit). */
  countOnly: z.boolean().optional(),
  page: z.number().int().min(1).max(40).optional(),
  criteria: criteriaSchema,
});

export async function GET() {
  const universe = await getApolloUniverseSnapshot();
  return NextResponse.json({
    configured: hasApolloConfig(),
    nextPage: universe.nextPage,
    universe,
    criteria: universe.criteria,
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
      ? `Apollo-universum (laatst): ${universe.total || "nog niet geteld"}. POST countOnly:true of apply:false telt (1 credit).`
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
  const countOnly = parsed.data.countOnly === true;
  const page = countOnly
    ? 1
    : (parsed.data.page ?? (await nextApolloDiscoverPage()));
  const search = await searchDoelgroepCompanies({
    page,
    perPage: countOnly ? 1 : 100,
    criteria,
  });
  if (!search.ok) {
    return NextResponse.json({ error: search.error }, { status: 400 });
  }

  await rememberApolloUniverse({
    total: search.total,
    criteria: search.criteria,
  });

  if (countOnly) {
    await logSessionActivity(session, {
      action: "apollo_count",
      summary: `Apollo-universum ~${search.total} · ${criteriaSummary(search.criteria)}`,
      path: "/api/outreach/discover",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { total: search.total, criteria: search.criteria, countOnly: true },
    });
    return NextResponse.json({
      ok: true,
      countOnly: true,
      creditUsed: 1,
      total: search.total,
      totalPages: Math.ceil(search.total / 100),
      criteria: search.criteria,
      criteriaLabel: criteriaSummary(search.criteria),
      note: "Apollo soft-match op HQ-locatie + size. Wij filteren daarna hard op plaats bij binnenhalen.",
    });
  }

  const split = splitByRegion(search.companies);
  const keep = keepForIntake(search.companies);

  if (!parsed.data.apply) {
    return NextResponse.json({
      ok: true,
      applied: false,
      creditUsed: 1,
      total: search.total,
      totalPages: Math.ceil(search.total / 100),
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
    summary: `Apollo pagina ${search.page}: ${result.created} nieuw · universe ~${search.total}`,
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
    totalPages: Math.ceil(search.total / 100),
    page: search.page,
    nextPage: search.page + 1,
    criteria: search.criteria,
    criteriaLabel: criteriaSummary(search.criteria),
    pageOutOfRegion: split.outOfRegion.length,
    pageKeep: keep.length,
    ...result,
  });
}
