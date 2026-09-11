/**
 * Haal de Apollo-doelgroep leeg (100 per credit) en zet namen in de lijst.
 * Usage: npx tsx scripts/fill-apollo-doelgroep.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { searchDoelgroepCompanies } from "../src/lib/integrations/apollo/client";
import { keepForIntake } from "../src/lib/integrations/apollo/criteria";
import {
  nextApolloDiscoverPage,
  rememberApolloPage,
  rememberApolloUniverse,
} from "../src/lib/outreach/apollo-page";
import { addProspects } from "../src/lib/outreach/intake";

const PER_PAGE = 100;
const MAX_PAGES = 20;

async function main() {
  let page = await nextApolloDiscoverPage();
  let total = 0;
  let created = 0;
  let duplicate = 0;
  let excluded = 0;
  let fetched = 0;
  let kept = 0;
  let skippedOut = 0;
  const startPage = page;

  console.log(`[apollo] start vanaf pagina ${page}`);

  while (page <= MAX_PAGES) {
    const search = await searchDoelgroepCompanies({ page, perPage: PER_PAGE });
    if (!search.ok) {
      throw new Error(search.error ?? `Apollo pagina ${page} mislukt`);
    }
    total = search.total;
    fetched += search.companies.length;
    await rememberApolloUniverse({
      total: search.total,
      criteria: search.criteria,
    });
    console.log(
      `[apollo] pagina ${page} · ${search.companies.length} namen · Apollo-totaal ${total}`,
    );

    if (search.companies.length === 0) break;

    const keep = keepForIntake(search.companies);
    skippedOut += search.companies.length - keep.length;
    kept += keep.length;
    console.log(
      `[apollo] pagina ${page} · ${keep.length}/${search.companies.length} bewaren`,
    );

    const added = await addProspects({
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
    if (!added.ok) {
      throw new Error(added.error ?? "intake mislukt");
    }
    created += added.created;
    duplicate += added.duplicate;
    excluded += added.excluded;
    await rememberApolloPage(
      search.page,
      search.companies.map((c) => c.name),
    );

    if (page * PER_PAGE >= total || search.companies.length < PER_PAGE) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(
    `[apollo] klaar · pagina's ${startPage}–${page} · nieuw ${created} · bestond al ${duplicate} · buiten regio overgeslagen ${skippedOut} · bewaard ${kept} · Apollo zegt ${total}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await endDb();
  });
