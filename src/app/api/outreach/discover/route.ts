import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  hasApolloConfig,
  searchDoelgroepCompanies,
} from "@/lib/integrations/apollo/client";
import {
  APOLLO_EMPLOYEE_RANGES,
  criteriaSummary,
  keepForIntake,
  normalizeCriteria,
  placePresetLabel,
  placesForPreset,
  splitByRegion,
  type ApolloSearchCriteria,
} from "@/lib/integrations/apollo/criteria";
import { addProspects } from "@/lib/outreach/intake";
import {
  getApolloUniverseSnapshot,
  nextApolloDiscoverPage,
  rememberApolloPage,
  rememberApolloUniverse,
} from "@/lib/outreach/apollo-page";
import { countSlices, drainSlices } from "@/lib/outreach/search-coverage";
import { logSessionActivity } from "@/lib/audit/session-log";
import { OUTREACH_RATES } from "@/lib/outreach/batch-costs";

export const dynamic = "force-dynamic";
/** Drain-all can walk many Apollo pages. */
export const maxDuration = 300;

const criteriaSchema = z
  .object({
    employeeRanges: z.array(z.string()).max(8).optional(),
    placePreset: z
      .enum(["ring", "kern", "amsterdam", "wide", "far"])
      .optional(),
    keywordTags: z.array(z.string()).max(8).optional(),
  })
  .optional();

const schema = z.object({
  apply: z.boolean().optional(),
  /** Alleen Apollo-totaal ophalen (per_page=1, 1 credit). */
  countOnly: z.boolean().optional(),
  /** With countOnly: also re-count segments we already counted. */
  recount: z.boolean().optional(),
  /** Loop pages until empty / done (Apollo max 100 per page = 1 credit each). */
  drain: z.boolean().optional(),
  /** Safety cap when drain=true (default 15 ≈ tot ~1.500 orgs). */
  maxPages: z.number().int().min(1).max(25).optional(),
  page: z.number().int().min(1).max(40).optional(),
  criteria: criteriaSchema,
});

async function fetchAndOptionallyApplyPage(input: {
  page: number;
  criteria: ApolloSearchCriteria;
  apply: boolean;
  countOnly?: boolean;
}) {
  const search = await searchDoelgroepCompanies({
    page: input.page,
    perPage: input.countOnly ? 1 : 100,
    criteria: input.criteria,
  });
  if (!search.ok) return { ok: false as const, error: search.error };

  await rememberApolloUniverse({
    total: search.total,
    criteria: search.criteria,
  });

  const split = splitByRegion(search.companies);
  const keep = keepForIntake(search.companies);

  if (!input.apply || input.countOnly) {
    return {
      ok: true as const,
      search,
      split,
      keep,
      created: 0,
      duplicate: 0,
      applied: false,
    };
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

  if (!result.ok) return { ok: false as const, error: result.error };

  await rememberApolloPage(
    search.page,
    search.companies.map((c) => c.name),
  );

  return {
    ok: true as const,
    search,
    split,
    keep,
    created: result.created,
    duplicate: result.duplicate,
    applied: true,
  };
}

export async function GET() {
  const universe = await getApolloUniverseSnapshot();
  return NextResponse.json({
    configured: hasApolloConfig(),
    nextPage: universe.nextPage,
    universe,
    criteria: universe.criteria,
    employeeRangeOptions: APOLLO_EMPLOYEE_RANGES,
    placePresets: (
      ["amsterdam", "kern", "ring", "wide", "far"] as const
    ).map((id) => ({
      id,
      label: placePresetLabel(id),
      placeCount: placesForPreset(id).length,
    })),
    hint: hasApolloConfig()
      ? `Apollo-universum (laatst): ${universe.total || "nog niet geteld"}. POST countOnly:true telt (1 credit); apply+drain haalt alles op.`
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
  const drain = parsed.data.drain === true && !countOnly;
  const maxPages = parsed.data.maxPages ?? 15;

  if (countOnly) {
    const counted = await countSlices({
      criteria,
      recount: parsed.data.recount === true,
    });
    if (!counted.ok) {
      return NextResponse.json({ error: counted.error }, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "apollo_count",
      summary: `Apollo geteld: ${counted.counted} segmenten · ~${counted.total} · ${criteriaSummary(criteria)}`,
      path: "/api/outreach/discover",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { total: counted.total, counted: counted.counted, criteria },
    });
    return NextResponse.json({
      ok: true,
      countOnly: true,
      creditUsed: counted.counted,
      estimatedCostCents: counted.counted * OUTREACH_RATES.apolloCreditCents,
      total: counted.total,
      counted: counted.counted,
      coverage: counted.states,
      criteria,
      criteriaLabel: criteriaSummary(criteria),
    });
  }

  if (drain && parsed.data.apply) {
    const drained = await drainSlices({ criteria, maxPages });
    if (!drained.ok) {
      return NextResponse.json(
        {
          error: drained.error,
          partial: { pages: drained.pages, created: drained.created },
        },
        { status: 400 },
      );
    }

    await logSessionActivity(session, {
      action: "apollo_discover_drain",
      summary: `Apollo ${drained.pages} pagina’s: +${drained.created} nieuw · ${criteriaSummary(criteria)}`,
      path: "/api/outreach/discover",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: {
        pages: drained.pages,
        created: drained.created,
        duplicate: drained.duplicate,
        outOfRegion: drained.outOfRegion,
        done: drained.done,
        criteria,
      },
    });

    return NextResponse.json({
      applied: true,
      drain: true,
      done: drained.done,
      pages: drained.pages,
      creditUsed: drained.pages,
      estimatedCostCents: drained.pages * OUTREACH_RATES.apolloCreditCents,
      created: drained.created,
      duplicate: drained.duplicate,
      pageOutOfRegion: drained.outOfRegion,
      coverage: drained.states,
      criteria,
      criteriaLabel: criteriaSummary(criteria),
    });
  }

  const page = parsed.data.page ?? (await nextApolloDiscoverPage());
  const one = await fetchAndOptionallyApplyPage({
    page,
    criteria,
    apply: parsed.data.apply === true,
  });
  if (!one.ok) {
    return NextResponse.json({ error: one.error }, { status: 400 });
  }

  if (!parsed.data.apply) {
    return NextResponse.json({
      ok: true,
      applied: false,
      creditUsed: 1,
      estimatedCostCents: OUTREACH_RATES.apolloCreditCents,
      total: one.search.total,
      totalPages: Math.ceil(one.search.total / 100),
      page: one.search.page,
      criteria: one.search.criteria,
      criteriaLabel: criteriaSummary(one.search.criteria),
      pageRaw: one.search.companies.length,
      pageInRegion: one.split.inRegion.length,
      pageOutOfRegion: one.split.outOfRegion.length,
      pageUnknownCity: one.split.unknownCity.length,
      pageKeep: one.keep.length,
      droppedSample: one.split.outOfRegion.slice(0, 8).map((c) => ({
        name: c.name,
        city: c.city ?? null,
      })),
      keepSample: one.keep.slice(0, 12).map((c) => ({
        name: c.name,
        city: c.city ?? null,
        employeeCount: c.employeeCount ?? null,
      })),
      note: "Apollo-totaal is vóór onze regio-hardfilter. We bewaren alleen in-regio (+ onbekende plaats).",
    });
  }

  await logSessionActivity(session, {
    action: "apollo_discover",
    summary: `Apollo pagina ${one.search.page}: ${one.created} nieuw · universe ~${one.search.total}`,
    path: "/api/outreach/discover",
    method: "POST",
    status: 200,
    tool: "outreach",
    meta: {
      page: one.search.page,
      created: one.created,
      duplicate: one.duplicate,
      total: one.search.total,
      outOfRegion: one.split.outOfRegion.length,
      criteria: one.search.criteria,
    },
  });

  return NextResponse.json({
    applied: true,
    total: one.search.total,
    totalPages: Math.ceil(one.search.total / 100),
    page: one.search.page,
    nextPage: one.search.page + 1,
    creditUsed: 1,
    estimatedCostCents: OUTREACH_RATES.apolloCreditCents,
    criteria: one.search.criteria,
    criteriaLabel: criteriaSummary(one.search.criteria),
    pageOutOfRegion: one.split.outOfRegion.length,
    pageKeep: one.keep.length,
    created: one.created,
    duplicate: one.duplicate,
  });
}
