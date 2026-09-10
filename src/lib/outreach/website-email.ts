/**
 * Public contact-page emails. No login, no scrape of private apps.
 */

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";

const PATHS = ["/", "/contact", "/contact-ons", "/nl/contact", "/over-ons", "/about"];
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SKIP =
  /^(noreply|no-reply|no_reply|privacy|unsubscribe|legal|vacature|jobs?|sollicitat|bounce|mailer-daemon|webmaster)@/i;
const RANK = [
  /^events?@/i,
  /^evenementen@/i,
  /^evenement@/i,
  /^hospitality@/i,
  /^office@/i,
  /^info@/i,
  /^hello@/i,
  /^contact@/i,
];

export type WebsiteEmailHit = {
  email: string;
  sourceUrl: string;
};

function rankEmail(email: string): number {
  const i = RANK.findIndex((re) => re.test(email));
  return i === -1 ? 80 : i;
}

export function pickBestPublicEmail(emails: string[]): string | null {
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))].filter(
    (e) => !SKIP.test(e) && !e.endsWith(".png") && !e.endsWith(".jpg"),
  );
  if (!unique.length) return null;
  unique.sort((a, b) => rankEmail(a) - rankEmail(b) || a.localeCompare(b));
  return unique[0] ?? null;
}

function extractEmails(html: string): string[] {
  const fromMailto = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) =>
    decodeURIComponent(m[1] ?? ""),
  );
  const fromText = html.match(EMAIL_RE) ?? [];
  return [...fromMailto, ...fromText];
}

function originOf(website: string): string | null {
  try {
    const url = new URL(
      /^https?:\/\//i.test(website) ? website : `https://${website}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "ThuishavenOutreach/1.0 (+mailto:team@blablabuild.com)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.includes("html") && !type.includes("text")) return null;
    const text = await res.text();
    return text.slice(0, 800_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function findPublicCompanyEmail(
  website: string,
): Promise<WebsiteEmailHit | null> {
  const origin = originOf(website);
  if (!origin) return null;

  const found: string[] = [];
  let sourceUrl = origin;
  for (const path of PATHS) {
    const url = path === "/" ? `${origin}/` : `${origin}${path}`;
    const html = await fetchText(url);
    if (!html) continue;
    const emails = extractEmails(html);
    if (emails.length) {
      found.push(...emails);
      sourceUrl = url;
      const best = pickBestPublicEmail(found);
      if (best && rankEmail(best) <= 2) {
        return { email: best, sourceUrl };
      }
    }
  }

  const best = pickBestPublicEmail(found);
  return best ? { email: best, sourceUrl } : null;
}

export type WebsiteEmailRow = {
  id: string;
  companyName: string;
  ok: boolean;
  email?: string;
  error?: string;
};

export async function fillCompanyWebsiteEmails(limit = 8): Promise<{
  ok: boolean;
  error?: string;
  processed: number;
  filled: number;
  rows: WebsiteEmailRow[];
}> {
  if (!hasDatabase()) {
    return { ok: false, error: "Geen database", processed: 0, filled: 0, rows: [] };
  }

  const db = getDb();
  const targets = await db
    .select({
      id: prospects.id,
      companyName: prospects.companyName,
      website: prospects.website,
      status: prospects.status,
      metadata: prospects.metadata,
    })
    .from(prospects)
    .where(
      and(
        eq(prospects.type, "company"),
        ne(prospects.status, "excluded"),
        isNull(prospects.email),
        sql`${prospects.website} is not null`,
        sql`coalesce(${prospects.metadata}->>'source', '') <> 'system'`,
        sql`coalesce((${prospects.metadata}->>'websiteEmailFails')::int, 0) < 2`,
      ),
    )
    .orderBy(sql`${prospects.createdAt} asc`)
    .limit(Math.min(Math.max(limit, 1), 8));

  const rows: WebsiteEmailRow[] = [];
  let filled = 0;

  for (const target of targets) {
    if (!target.website) continue;
    const hit = await findPublicCompanyEmail(target.website);
    const meta = { ...(target.metadata ?? {}) };
    if (!hit) {
      meta.websiteEmailFails =
        typeof meta.websiteEmailFails === "number"
          ? meta.websiteEmailFails + 1
          : 1;
      meta.websiteEmailError = "Geen publiek adres gevonden";
      await db
        .update(prospects)
        .set({ metadata: meta, updatedAt: new Date() })
        .where(eq(prospects.id, target.id));
      rows.push({
        id: target.id,
        companyName: target.companyName,
        ok: false,
        error: "Geen events@ / info@ op de site",
      });
      continue;
    }

    meta.websiteEmailAt = new Date().toISOString();
    meta.websiteEmailSource = hit.sourceUrl;
    delete meta.websiteEmailFails;
    delete meta.websiteEmailError;

    const keepStatus = new Set([
      "contacted",
      "opened",
      "replied",
      "lead",
      "excluded",
    ]);
    await db
      .update(prospects)
      .set({
        email: hit.email,
        status: keepStatus.has(target.status) ? target.status : "ready",
        metadata: meta,
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, target.id));

    filled += 1;
    rows.push({
      id: target.id,
      companyName: target.companyName,
      ok: true,
      email: hit.email,
    });
  }

  return { ok: true, processed: rows.length, filled, rows };
}
