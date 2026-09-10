import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import {
  hasApolloConfig,
  searchDoelgroepCompanies,
} from "@/lib/integrations/apollo/client";
import { addProspects } from "@/lib/outreach/intake";
import {
  nextApolloDiscoverPage,
  rememberApolloPage,
} from "@/lib/outreach/apollo-page";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";

const schema = z.object({
  apply: z.boolean().optional(),
  page: z.number().int().min(1).max(40).optional(),
});

export async function GET() {
  const nextPage = await nextApolloDiscoverPage();
  return NextResponse.json({
    configured: hasApolloConfig(),
    nextPage,
    hint: hasApolloConfig()
      ? `POST { apply: true } haalt pagina ${nextPage} (1 Apollo-credit)`
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

  const page = parsed.data.page ?? (await nextApolloDiscoverPage());
  const search = await searchDoelgroepCompanies({
    page,
    perPage: 100,
  });
  if (!search.ok) {
    return NextResponse.json({ error: search.error }, { status: 400 });
  }

  if (!parsed.data.apply) {
    return NextResponse.json({
      ok: true,
      applied: false,
      total: search.total,
      page: search.page,
      companies: search.companies,
    });
  }

  const result = await addProspects({
    type: "company",
    source: "apollo",
    drafts: search.companies.map((c) => ({
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
    summary: `Apollo pagina ${search.page}: ${result.created} nieuw · ${result.duplicate} bestond al`,
    path: "/api/outreach/discover",
    method: "POST",
    status: 200,
    tool: "outreach",
    meta: {
      page: search.page,
      created: result.created,
      duplicate: result.duplicate,
      total: search.total,
    },
  });

  return NextResponse.json({
    applied: true,
    total: search.total,
    page: search.page,
    nextPage: search.page + 1,
    ...result,
  });
}
