/**
 * Add names to the outreach list.
 * Names come from us (partner sheet, paste, LinkedIn) — KvK only enriches after.
 */

import { getDb, hasDatabase } from "@/lib/db/client";
import { exclusions, prospects } from "@/lib/db/schema";
import { normalizeCompanyKey } from "@/lib/outreach/data";
import type { ProspectType } from "@/lib/outreach/data";

export type IntakeSource = "manual" | "paste" | "linkedin";

export type IntakeDraft = {
  companyName: string;
  email?: string | null;
  website?: string | null;
  notes?: string | null;
};

export type IntakeRowResult = {
  companyName: string;
  status: "created" | "duplicate" | "excluded" | "invalid";
  reason?: string;
  id?: string;
};

export type AddProspectsResult = {
  ok: boolean;
  error?: string;
  created: number;
  duplicate: number;
  excluded: number;
  invalid: number;
  rows: IntakeRowResult[];
};

export function parseProspectPaste(raw: string): IntakeDraft[] {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const drafts: IntakeDraft[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (/^(bedrijf|company|naam|name)\b/i.test(line) && !line.includes("@")) {
      continue;
    }

    const parts = line.split(/[,;\t|]/).map((p) => p.trim()).filter(Boolean);
    const emailFromParts = parts.find((p) => p.includes("@"))?.toLowerCase() ?? null;
    const namePart =
      parts.find((p) => p !== emailFromParts && !/^https?:\/\//i.test(p)) ??
      parts[0] ??
      "";
    const website =
      parts.find((p) => /^https?:\/\//i.test(p)) ??
      null;
    const companyName = namePart.replace(/\s+/g, " ").trim();
    if (!companyName) continue;

    const key = normalizeCompanyKey(companyName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    drafts.push({
      companyName,
      email: emailFromParts,
      website,
    });
  }

  return drafts;
}

async function loadExclusionKeys(): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({
      companyName: exclusions.companyName,
      email: exclusions.email,
    })
    .from(exclusions);
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.companyName) keys.add(normalizeCompanyKey(row.companyName));
    if (row.email) keys.add(row.email.trim().toLowerCase());
  }
  return keys;
}

export async function addProspects(input: {
  drafts: IntakeDraft[];
  type: ProspectType;
  source: IntakeSource;
}): Promise<AddProspectsResult> {
  if (!hasDatabase()) {
    return {
      ok: false,
      error: "Geen database",
      created: 0,
      duplicate: 0,
      excluded: 0,
      invalid: 0,
      rows: [],
    };
  }

  const db = getDb();
  const exclusionKeys = await loadExclusionKeys();
  const existing = await db
    .select({
      id: prospects.id,
      companyName: prospects.companyName,
    })
    .from(prospects);
  const existingByKey = new Map(
    existing.map((p) => [normalizeCompanyKey(p.companyName), p]),
  );

  const rows: IntakeRowResult[] = [];
  let created = 0;
  let duplicate = 0;
  let excluded = 0;
  let invalid = 0;

  for (const draft of input.drafts) {
    const companyName = draft.companyName.trim();
    const key = normalizeCompanyKey(companyName);
    if (!companyName || !key) {
      invalid += 1;
      rows.push({
        companyName: draft.companyName || "(leeg)",
        status: "invalid",
        reason: "Geen geldige bedrijfsnaam",
      });
      continue;
    }

    const email = draft.email?.trim().toLowerCase() || null;
    if (exclusionKeys.has(key) || (email && exclusionKeys.has(email))) {
      excluded += 1;
      rows.push({
        companyName,
        status: "excluded",
        reason: "Staat op Niet mailen",
      });
      continue;
    }

    const match = existingByKey.get(key);
    if (match) {
      duplicate += 1;
      rows.push({
        companyName,
        status: "duplicate",
        reason: "Stond al op de lijst",
        id: match.id,
      });
      continue;
    }

    const [inserted] = await db
      .insert(prospects)
      .values({
        type: input.type,
        companyName,
        email,
        website: draft.website?.trim() || null,
        status: email ? "ready" : "discovered",
        metadata: {
          source: input.source,
          notes: draft.notes?.trim() || undefined,
          addedAt: new Date().toISOString(),
        },
      })
      .returning({ id: prospects.id, companyName: prospects.companyName });

    existingByKey.set(key, {
      id: inserted!.id,
      companyName: inserted!.companyName,
    });
    created += 1;
    rows.push({
      companyName,
      status: "created",
      id: inserted!.id,
    });
  }

  return {
    ok: true,
    created,
    duplicate,
    excluded,
    invalid,
    rows,
  };
}
