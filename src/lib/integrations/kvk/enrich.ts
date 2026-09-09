/**
 * Enrich a company we already know — search only by name or KvK number.
 * KvK policy: no SBI / place / bulk targeting.
 */

import { eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import {
  kvkBasisprofiel,
  kvkVestigingsprofiel,
  kvkZoeken,
  hasKvkConfig,
} from "./client";
import { candidateFromProfiles } from "./discovery";
import type { KvkProspectCandidate } from "./types";

export type EnrichKvkInput = {
  naam?: string;
  kvkNummer?: string;
};

export type EnrichKvkResult =
  | { ok: true; candidate: KvkProspectCandidate; matches: number }
  | { ok: false; error: string };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export async function enrichKnownCompany(
  input: EnrichKvkInput,
): Promise<EnrichKvkResult> {
  if (!hasKvkConfig()) return { ok: false, error: "KVK_API_KEY ontbreekt" };

  const naam = input.naam?.trim();
  const kvkNummer = input.kvkNummer ? digitsOnly(input.kvkNummer) : "";

  if (!naam && !kvkNummer) {
    return {
      ok: false,
      error: "Vul een bedrijfsnaam of KvK-nummer in (geen plaats/SBI-zoekactie).",
    };
  }
  if (kvkNummer && kvkNummer.length !== 8) {
    return { ok: false, error: "KvK-nummer moet 8 cijfers zijn." };
  }

  let kvk = kvkNummer || "";
  let vestigingsnummer: string | undefined;
  let zoekHit = undefined;

  if (!kvk && naam) {
    const zoek = await kvkZoeken({
      naam,
      type: "hoofdvestiging",
      resultatenPerPagina: 5,
      pagina: 1,
    });
    if (zoek.error) return { ok: false, error: zoek.error };
    const hits = zoek.data?.resultaten ?? [];
    const exact = hits.find(
      (h) => h.naam?.trim().toLowerCase() === naam.toLowerCase(),
    );
    const hit = exact ?? hits[0];
    if (!hit?.kvkNummer) {
      return { ok: false, error: "Geen KvK-treffer op deze bedrijfsnaam." };
    }
    kvk = hit.kvkNummer;
    vestigingsnummer = hit.vestigingsnummer;
    zoekHit = hit;
  }

  const basis = await kvkBasisprofiel(kvk);
  if (basis.error || !basis.data) {
    return { ok: false, error: basis.error ?? "Basisprofiel niet gevonden" };
  }

  const vestNr =
    vestigingsnummer ??
    basis.data._embedded?.hoofdvestiging?.vestigingsnummer;
  if (!vestNr) {
    return { ok: false, error: "Geen vestigingsnummer in KvK-profiel." };
  }

  const vest = await kvkVestigingsprofiel(vestNr);
  if (vest.error || !vest.data) {
    return {
      ok: false,
      error: vest.error ?? "Vestigingsprofiel niet gevonden",
    };
  }

  const candidate = candidateFromProfiles({
    zoek: zoekHit,
    basis: basis.data,
    vestiging: vest.data,
  });
  if (!candidate) {
    return { ok: false, error: "KvK-profiel kon niet worden omgezet." };
  }

  return {
    ok: true,
    candidate,
    matches: zoekHit ? 1 : 1,
  };
}

export async function applyKvkCandidateToProspect(
  prospectId: string,
  candidate: KvkProspectCandidate,
): Promise<{ ok: true; prospectId: string } | { ok: false; error: string }> {
  if (!hasDatabase()) return { ok: false, error: "Geen database" };

  const db = getDb();
  const [row] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);

  if (!row) return { ok: false, error: "Prospect niet gevonden" };

  const meta = { ...(row.metadata ?? {}) };
  meta.kvkEnrichedAt = new Date().toISOString();
  meta.vestigingsnummer = candidate.vestigingsnummer ?? meta.vestigingsnummer;
  meta.sbiCode = candidate.sbiCode ?? meta.sbiCode;
  meta.nonMailing = candidate.nonMailing;
  if (typeof meta.source !== "string") meta.source = "kvk";

  const keepStatus = new Set([
    "contacted",
    "opened",
    "replied",
    "lead",
    "excluded",
  ]);
  const nextStatus = keepStatus.has(row.status) ? row.status : "enriched";

  await db
    .update(prospects)
    .set({
      kvkNumber: candidate.kvkNumber,
      sector: candidate.sector ?? row.sector,
      employeeCount: candidate.employeeCount ?? row.employeeCount,
      city: candidate.city ?? row.city,
      foundedAt: candidate.foundedAt
        ? new Date(`${candidate.foundedAt}T00:00:00.000Z`)
        : row.foundedAt,
      anniversaryYears: candidate.anniversaryYears ?? row.anniversaryYears,
      website: candidate.website ?? row.website,
      status: nextStatus,
      metadata: meta,
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, prospectId));

  return { ok: true, prospectId };
}

export async function findProspectForKvk(input: {
  prospectId?: string;
  naam?: string;
  kvkNummer?: string;
}): Promise<{ id: string; companyName: string } | null> {
  if (!hasDatabase()) return null;
  const db = getDb();

  if (input.prospectId) {
    const [row] = await db
      .select({ id: prospects.id, companyName: prospects.companyName })
      .from(prospects)
      .where(eq(prospects.id, input.prospectId))
      .limit(1);
    return row ?? null;
  }

  const kvk = input.kvkNummer ? digitsOnly(input.kvkNummer) : "";
  if (kvk.length === 8) {
    const [byKvk] = await db
      .select({ id: prospects.id, companyName: prospects.companyName })
      .from(prospects)
      .where(eq(prospects.kvkNumber, kvk))
      .limit(1);
    if (byKvk) return byKvk;
  }

  const naam = input.naam?.trim();
  if (naam) {
    const [byName] = await db
      .select({ id: prospects.id, companyName: prospects.companyName })
      .from(prospects)
      .where(sql`lower(${prospects.companyName}) = ${naam.toLowerCase()}`)
      .limit(1);
    if (byName) return byName;
  }

  return null;
}
