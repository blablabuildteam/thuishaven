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
import { logSessionActivity } from "@/lib/audit/session-log";
import { OUTREACH_RATES } from "@/lib/outreach/batch-costs";

export const dynamic = "force-dynamic";
/** Drain-all can walk many Apollo pages. */
export const maxDuration = 300;

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
    const one = await fetchAndOptionallyApplyPage({
      page: 1,
      criteria,
      apply: false,
      countOnly: true,
    });
    if (!one.ok) {
      return NextResponse.json({ error: one.error }, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "apollo_count",
      summary: `Apollo-universum ~${one.search.total} · ${criteriaSummary(one.search.criteria)}`,
      path: "/api/outreach/discover",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: {
        total: one.search.total,
        criteria: one.search.criteria,
        countOnly: true,
      },
    });
    return NextResponse.json({
      ok: true,
      countOnly: true,
      creditUsed: 1,
      estimatedCostCents: OUTREACH_RATES.apolloCreditCents,
      total: one.search.total,
      totalPages: Math.ceil(one.search.total / 100),
      criteria: one.search.criteria,
      criteriaLabel: criteriaSummary(one.search.criteria),
      note: "Apollo soft-match op HQ-locatie + size. Wij filteren hard op plaats bij binnenhalen.",
    });
  }

  if (drain && parsed.data.apply) {
    let page = parsed.data.page ?? (await nextApolloDiscoverPage());
    let created = 0;
    let duplicate = 0;
    let outOfRegion = 0;
    let pages = 0;
    let total = 0;
    let lastCriteria = criteria;
    let emptyPage = false;

    while (pages < maxPages) {
      const one = await fetchAndOptionallyApplyPage({
        page,
        criteria,
        apply: true,
      });
      if (!one.ok) {
        return NextResponse.json(
          {
            error: one.error,
            partial: { pages, created, duplicate, outOfRegion },
          },
          { status: 400 },
        );
      }
      pages += 1;
      created += one.created;
      duplicate += one.duplicate;
      outOfRegion += one.split.outOfRegion.length;
      total = one.search.total;
      lastCriteria = one.search.criteria;

      const raw = one.search.companies.length;
      if (raw === 0) {
        emptyPage = true;
        break;
      }
      // Next page; stop if we've walked past reported total
      page += 1;
      if (page > Math.ceil(Math.max(total, 1) / 100)) break;
    }

    const totalPages = Math.ceil(Math.max(total, 1) / 100);
    const done = emptyPage || page > totalPages;

    await logSessionActivity(session, {
      action: "apollo_discover_drain",
      summary: `Apollo drain ${pages} pagina’s: +${created} nieuw · ~${total} universe`,
      path: "/api/outreach/discover",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: {
        pages,
        created,
        duplicate,
        outOfRegion,
        total,
        done,
        criteria: lastCriteria,
      },
    });

    return NextResponse.json({
      applied: true,
      drain: true,
      done,
      pages,
      creditUsed: pages,
      estimatedCostCents: pages * OUTREACH_RATES.apolloCreditCents,
      total,
      totalPages,
      nextPage: page,
      created,
      duplicate,
      pageOutOfRegion: outOfRegion,
      criteria: lastCriteria,
      criteriaLabel: criteriaSummary(lastCriteria),
      note: done
        ? "Alles binnen gehaald voor deze filters (Apollo levert max 100 per pagina; wij liepen ze achter elkaar af)."
        : `Gestopt na ${pages} pagina’s (limiet). Klik nog eens om door te gaan.`,
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
