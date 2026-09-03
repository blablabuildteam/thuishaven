/**
 * Seed outreach exclusions + agency prospects from Reijner CSVs.
 *
 * Usage: npx tsx scripts/seed-outreach.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { endDb, getDb } from "../src/lib/db/client";
import { campaigns, exclusions, prospects } from "../src/lib/db/schema";
import { normalizeCompanyKey } from "../src/lib/outreach/data";
import { seedAvailabilityFromMockIfEmpty } from "../src/lib/outreach/availability";

function parseCsv(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

function splitEmails(raw: string): string[] {
  return raw
    .split(/[,;/]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"))
    .map((e) => e.toLowerCase());
}

async function main() {
  const root = resolve(process.cwd());
  const exclusionCsv = readFileSync(
    resolve(root, "data/outreach/exclusions.csv"),
    "utf8",
  );
  const agencyCsv = readFileSync(
    resolve(root, "data/outreach/agencies.csv"),
    "utf8",
  );

  const exclusionRows = parseCsv(exclusionCsv).slice(1);
  const agencyRows = parseCsv(agencyCsv).slice(1);

  const db = getDb();

  // Campaigns
  const existingCampaigns = await db.select().from(campaigns);
  if (existingCampaigns.length === 0) {
    await db.insert(campaigns).values([
      {
        name: "Jubilea Amsterdam · open",
        audience: "company",
        status: "draft",
        description:
          "Bedrijven 500–5.000 medewerkers, Amsterdam + 50 km, focus op 5/10/25-jarig jubileum.",
      },
      {
        name: "Open data · Event bureaus",
        audience: "agency",
        status: "active",
        description:
          "Doorlopende beschikbaarheids-updates naar partner event management bureaus (Reijner-lijst).",
      },
    ]);
    console.log("[seed] campaigns created");
  }

  // Exclusions — wipe + reinsert from sheet (source of truth for now)
  await db.delete(exclusions);
  const exclusionCompanies = exclusionRows
    .map((r) => r[0]?.trim())
    .filter((n): n is string => Boolean(n));

  if (exclusionCompanies.length) {
    await db.insert(exclusions).values(
      exclusionCompanies.map((companyName) => ({
        companyName,
        reason: "Bestaande klant / uitsluiting (Reijner lijst aug 2026)",
      })),
    );
  }
  console.log("[seed] exclusions:", exclusionCompanies.length);

  const exclusionKeys = new Set(
    exclusionCompanies.map((n) => normalizeCompanyKey(n)),
  );

  // Agencies — upsert by company name
  let agencyUpserts = 0;
  let agencyExcluded = 0;
  const existingAgencies = await db
    .select()
    .from(prospects)
    .where(eq(prospects.type, "agency"));
  const agencyByKey = new Map(
    existingAgencies.map((p) => [normalizeCompanyKey(p.companyName), p]),
  );

  for (const row of agencyRows) {
    const companyName = row[0]?.trim();
    if (!companyName) continue;
    const emails = splitEmails(row[1] ?? "");
    const primary = emails[0] ?? null;
    const key = normalizeCompanyKey(companyName);
    const isExcluded = exclusionKeys.has(key);
    const match = agencyByKey.get(key);

    const payload = {
      type: "agency" as const,
      companyName,
      sector: "Event management",
      email: primary,
      status: isExcluded ? ("excluded" as const) : ("ready" as const),
      excludedReason: isExcluded
        ? "Staat op uitsluitingslijst / bestaande relatie"
        : null,
      metadata: {
        source: "bureau_import",
        contacts: emails,
        importedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    };

    if (match) {
      await db.update(prospects).set(payload).where(eq(prospects.id, match.id));
    } else {
      await db.insert(prospects).values(payload);
    }
    agencyUpserts += 1;
    if (isExcluded) agencyExcluded += 1;
  }

  console.log(
    "[seed] agencies:",
    agencyUpserts,
    `(excluded overlap: ${agencyExcluded})`,
  );

  const avail = await seedAvailabilityFromMockIfEmpty();
  console.log("[seed] availability days inserted:", avail.inserted);

  await endDb();
  console.log("[seed] done");
}

main().catch(async (e) => {
  console.error(e);
  await endDb().catch(() => undefined);
  process.exit(1);
});
