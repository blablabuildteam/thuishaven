/**
 * Contactpersonen per bedrijf (metadata.contacts + primaire decisionMaker).
 */

import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";

export type CompanyContact = {
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
};

function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

export function normalizeContact(raw: unknown): CompanyContact | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const name = typeof c.name === "string" ? c.name.trim() : "";
  if (name.length < 2) return null;
  const title =
    typeof c.title === "string" && c.title.trim() ? c.title.trim() : undefined;
  const email = normalizeEmail(
    typeof c.email === "string" ? c.email : undefined,
  );
  const linkedinUrl =
    typeof c.linkedinUrl === "string" && c.linkedinUrl.trim()
      ? c.linkedinUrl.trim()
      : undefined;
  return {
    name,
    ...(title ? { title } : {}),
    ...(email ? { email } : {}),
    ...(linkedinUrl ? { linkedinUrl } : {}),
  };
}

export function contactsEqualEmail(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const aa = normalizeEmail(a);
  const bb = normalizeEmail(b);
  return Boolean(aa && bb && aa === bb);
}

/** Deduplicate by email (preferred) or name+title. */
export function dedupeContacts(list: CompanyContact[]): CompanyContact[] {
  const out: CompanyContact[] = [];
  const seenEmail = new Set<string>();
  const seenName = new Set<string>();
  for (const c of list) {
    const email = normalizeEmail(c.email);
    const key = email ?? `n:${c.name.toLowerCase()}|${(c.title ?? "").toLowerCase()}`;
    if (email) {
      if (seenEmail.has(email)) continue;
      seenEmail.add(email);
    } else {
      if (seenName.has(key)) continue;
      seenName.add(key);
    }
    out.push(c);
  }
  return out;
}

export function primaryContactFrom(
  contacts: CompanyContact[],
  companyEmail: string | null | undefined,
): CompanyContact | null {
  const withCompanyMail = contacts.find((c) =>
    contactsEqualEmail(c.email, companyEmail),
  );
  if (withCompanyMail) return withCompanyMail;
  const withMail = contacts.find((c) => normalizeEmail(c.email));
  return withMail ?? contacts[0] ?? null;
}

export async function saveProspectContacts(input: {
  prospectId: string;
  contacts: CompanyContact[];
  /** Index in contacts to use as primary mail target. */
  primaryIndex?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasDatabase()) return { ok: false, error: "Geen database" };
  const db = getDb();
  const [row] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1);
  if (!row) return { ok: false, error: "Bedrijf niet gevonden" };

  const contacts = dedupeContacts(
    input.contacts.map(normalizeContact).filter((c): c is CompanyContact => Boolean(c)),
  );
  if (contacts.length > 20) {
    return { ok: false, error: "Maximaal 20 contactpersonen" };
  }

  const primaryIdx =
    typeof input.primaryIndex === "number" &&
    input.primaryIndex >= 0 &&
    input.primaryIndex < contacts.length
      ? input.primaryIndex
      : Math.max(
          0,
          contacts.findIndex((c) => contactsEqualEmail(c.email, row.email)),
        );
  const primary =
    contacts[primaryIdx] ??
    primaryContactFrom(contacts, row.email) ??
    null;

  const meta = { ...(row.metadata ?? {}) } as Record<string, unknown>;
  meta.contacts = contacts;
  if (primary) {
    meta.decisionMaker = {
      name: primary.name,
      ...(primary.title ? { title: primary.title } : {}),
      ...(primary.email ? { email: primary.email } : {}),
      ...(primary.linkedinUrl ? { linkedinUrl: primary.linkedinUrl } : {}),
      source: "manual",
    };
  } else {
    delete meta.decisionMaker;
  }

  await db
    .update(prospects)
    .set({
      metadata: meta,
      email: primary?.email ?? row.email,
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, row.id));

  return { ok: true };
}
