/**
 * Mailbox check before a mail is written or sent — cached per address on the prospect.
 */

import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { prospects } from "@/lib/db/schema";
import {
  hasHunterConfig,
  verifyHunterEmail,
} from "@/lib/integrations/hunter/client";
import {
  readEmailChecks,
  type EmailCheck,
} from "@/lib/outreach/contact-ranking";

const DAY = 24 * 60 * 60 * 1000;

function isFresh(check: EmailCheck): boolean {
  const age = Date.now() - new Date(check.at).getTime();
  const ttl = check.status === "unknown" ? 7 * DAY : 90 * DAY;
  return age < ttl;
}

/**
 * Cached Hunter verification. Returns `null` when no check could be made
 * (no key, quota op) — caller decides; we never block on that.
 */
export async function verifyProspectEmail(input: {
  prospectId: string;
  email: string;
}): Promise<EmailCheck | null> {
  const email = input.email.trim().toLowerCase();
  if (!email || !hasDatabase()) return null;
  const db = getDb();
  const [row] = await db
    .select({ metadata: prospects.metadata })
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1);
  if (!row) return null;

  const checks = readEmailChecks(row.metadata);
  const cached = checks[email];
  if (cached && isFresh(cached)) return cached;
  if (!hasHunterConfig()) return cached ?? null;

  const result = await verifyHunterEmail(email);
  if (!result.ok) return cached ?? null;

  const check: EmailCheck = {
    status: result.status,
    ...(typeof result.score === "number" ? { score: result.score } : {}),
    at: new Date().toISOString(),
  };

  // Re-read so parallel enrichment writes aren't lost.
  const [fresh] = await db
    .select({ metadata: prospects.metadata })
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1);
  const meta = { ...((fresh?.metadata ?? {}) as Record<string, unknown>) };
  meta.emailChecks = { ...readEmailChecks(meta), [email]: check };
  await db
    .update(prospects)
    .set({ metadata: meta, updatedAt: new Date() })
    .where(eq(prospects.id, input.prospectId));

  return check;
}
