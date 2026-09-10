/**
 * CRM view over prospects: company record + contact timeline.
 */

import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  inboundReplies,
  leads,
  outreachEmails,
  prospects,
} from "@/lib/db/schema";
import { statusLabels, type ProspectStatus, type ProspectType } from "./data";
import { kvkHeadcountLooksOff } from "./linkedin";
import { isSystemProspect } from "./apollo-page";
import { scoreDoelgroep, employeeCountForFit } from "./doelgroep";
import {
  EXISTING_CUSTOMER_REASON,
  EXCLUSION_IMPORT_SOURCE,
} from "./exclusions-sync";

export { statusLabels };

export type CrmNote = {
  id: string;
  kind: "note" | "call" | "linkedin";
  body: string;
  at: string;
};

export type CrmTimelineItem = {
  id: string;
  at: string;
  kind: "mail" | "reply" | "note" | "call" | "linkedin" | "kvk" | "lead";
  title: string;
  detail?: string | null;
  status?: string;
};

export type CrmRecord = {
  id: string;
  companyName: string;
  type: ProspectType;
  status: ProspectStatus;
  email: string | null;
  website: string | null;
  city: string | null;
  sector: string | null;
  kvkNumber: string | null;
  employeeCount: number | null;
  anniversaryYears: number | null;
  source?: string;
  doelgroepFit?: string;
  doelgroepReason?: string;
  nonMailing: boolean;
  partner: boolean;
  /** Reijner "niet mailen" / bestaande klant — in CRM, niet cold. */
  existingCustomer: boolean;
  excludedReason: string | null;
  mailCount: number;
  replyCount: number;
  lastTouchAt: string | null;
  linkedinUrl: string | null;
  linkedinEmployeeEstimate: number | null;
  kvkHeadcountOff: boolean;
  decisionMakerName?: string;
  decisionMakerTitle?: string;
  decisionMakerEmailSource?: string;
};

export type CrmDossier = CrmRecord & {
  notes: CrmNote[];
  timeline: CrmTimelineItem[];
  lastLead?: { summary: string | null; createdAt: string } | null;
};

function notesFromMeta(meta: Record<string, unknown>): CrmNote[] {
  const raw = meta.crmNotes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((n): n is CrmNote => {
    if (!n || typeof n !== "object") return false;
    const row = n as CrmNote;
    return Boolean(row.id && row.body && row.at && row.kind);
  });
}

function mapRecord(
  p: typeof prospects.$inferSelect,
  extras: { mailCount: number; replyCount: number; lastTouchAt: string | null },
): CrmRecord {
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const estimate =
    typeof meta.linkedinEmployeeEstimate === "number"
      ? meta.linkedinEmployeeEstimate
      : null;
  const scored = scoreDoelgroep({
    employeeCount: employeeCountForFit({
      kvkCount: p.employeeCount,
      estimate,
    }),
    city: p.city,
  });
  const storedFit =
    typeof meta.doelgroepFit === "string" ? meta.doelgroepFit : undefined;
  // Live herberekenen zodat KvK-plaats buiten regio niet als "fit" blijft hangen.
  const doelgroepFit = scored.fit !== "onbekend" ? scored.fit : storedFit;
  const doelgroepReason =
    scored.fit !== "onbekend"
      ? scored.reason
      : typeof meta.doelgroepReason === "string"
        ? meta.doelgroepReason
        : undefined;

  return {
    id: p.id,
    companyName: p.companyName,
    type: p.type,
    status: p.status,
    email: p.email,
    website: p.website,
    city: p.city,
    sector: p.sector,
    kvkNumber: p.kvkNumber,
    employeeCount: p.employeeCount,
    anniversaryYears: p.anniversaryYears,
    source: typeof meta.source === "string" ? meta.source : undefined,
    doelgroepFit,
    doelgroepReason,
    nonMailing: meta.nonMailing === true,
    partner: p.type === "agency" && meta.source === "bureau_import",
    existingCustomer:
      meta.source === EXCLUSION_IMPORT_SOURCE ||
      p.excludedReason === EXISTING_CUSTOMER_REASON ||
      (p.status === "excluded" &&
        !(p.type === "agency" && meta.source === "bureau_import")),
    excludedReason: p.excludedReason,
    mailCount: extras.mailCount,
    replyCount: extras.replyCount,
    lastTouchAt: extras.lastTouchAt,
    linkedinUrl: p.linkedinUrl,
    linkedinEmployeeEstimate: estimate,
    decisionMakerName:
      meta.decisionMaker &&
      typeof meta.decisionMaker === "object" &&
      typeof (meta.decisionMaker as { name?: string }).name === "string"
        ? (meta.decisionMaker as { name: string }).name
        : undefined,
    decisionMakerTitle:
      meta.decisionMaker &&
      typeof meta.decisionMaker === "object" &&
      typeof (meta.decisionMaker as { title?: string }).title === "string"
        ? (meta.decisionMaker as { title: string }).title
        : undefined,
    decisionMakerEmailSource:
      meta.decisionMaker &&
      typeof meta.decisionMaker === "object" &&
      typeof (meta.decisionMaker as { emailSource?: string }).emailSource ===
        "string"
        ? (meta.decisionMaker as { emailSource: string }).emailSource
        : typeof meta.emailSource === "string"
          ? meta.emailSource
          : undefined,
    kvkHeadcountOff: kvkHeadcountLooksOff(
      typeof meta.kvkVestigingEmployees === "number"
        ? meta.kvkVestigingEmployees
        : p.employeeCount,
    ),
  };
}

export async function listCrmRecords(): Promise<{
  rows: CrmRecord[];
  source: "db" | "empty";
}> {
  if (!hasDatabase()) return { rows: [], source: "empty" };

  const db = getDb();
  const people = await db.select().from(prospects).orderBy(prospects.companyName);

  const mailStats = await db
    .select({
      prospectId: outreachEmails.prospectId,
      mailCount: sql<number>`count(*) filter (where ${outreachEmails.status} <> 'draft')::int`,
      lastSent: sql<Date | null>`max(${outreachEmails.sentAt})`,
    })
    .from(outreachEmails)
    .groupBy(outreachEmails.prospectId);

  const replyStats = await db
    .select({
      prospectId: inboundReplies.prospectId,
      replyCount: sql<number>`count(*)::int`,
      lastReply: sql<Date | null>`max(${inboundReplies.receivedAt})`,
    })
    .from(inboundReplies)
    .groupBy(inboundReplies.prospectId);

  const mailMap = new Map(mailStats.map((s) => [s.prospectId, s]));
  const replyMap = new Map(
    replyStats.filter((s) => s.prospectId).map((s) => [s.prospectId!, s]),
  );

  const rows = people
    .filter((p) => {
      const source =
        typeof p.metadata?.source === "string" ? p.metadata.source : null;
      return !isSystemProspect({ companyName: p.companyName, source });
    })
    .map((p) => {
    const mail = mailMap.get(p.id);
    const reply = replyMap.get(p.id);
    const toDate = (d: unknown): Date | null => {
      if (!d) return null;
      const date = d instanceof Date ? d : new Date(String(d));
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const lastCandidates = [mail?.lastSent, reply?.lastReply]
      .map(toDate)
      .filter((d): d is Date => d !== null);
    const last = lastCandidates.sort((a, b) => b.getTime() - a.getTime())[0];
    return mapRecord(p, {
      mailCount: mail?.mailCount ?? 0,
      replyCount: reply?.replyCount ?? 0,
      lastTouchAt: last?.toISOString() ?? null,
    });
  });

  return { rows, source: "db" };
}

export async function getCrmDossier(
  id: string,
): Promise<{ dossier: CrmDossier | null; source: "db" | "empty" }> {
  if (!hasDatabase()) return { dossier: null, source: "empty" };

  const db = getDb();
  const [p] = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1);
  if (!p) return { dossier: null, source: "db" };
  const source =
    typeof p.metadata?.source === "string" ? p.metadata.source : null;
  if (isSystemProspect({ companyName: p.companyName, source })) {
    return { dossier: null, source: "db" };
  }

  const [mails, replies, leadRows] = await Promise.all([
    db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.prospectId, id))
      .orderBy(desc(outreachEmails.createdAt)),
    db
      .select()
      .from(inboundReplies)
      .where(eq(inboundReplies.prospectId, id))
      .orderBy(desc(inboundReplies.receivedAt)),
    db
      .select()
      .from(leads)
      .where(eq(leads.prospectId, id))
      .orderBy(desc(leads.createdAt))
      .limit(1),
  ]);

  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const notes = notesFromMeta(meta);

  const timeline: CrmTimelineItem[] = [];

  for (const mail of mails) {
    timeline.push({
      id: `mail-${mail.id}`,
      at: (mail.sentAt ?? mail.createdAt).toISOString(),
      kind: "mail",
      title: mail.status === "draft" ? "Conceptmail" : "Mail verstuurd",
      detail: mail.subject,
      status: mail.status,
    });
    if (mail.openedAt) {
      timeline.push({
        id: `open-${mail.id}`,
        at: mail.openedAt.toISOString(),
        kind: "mail",
        title: "Mail geopend",
        detail: mail.subject,
        status: "opened",
      });
    }
  }

  for (const reply of replies) {
    timeline.push({
      id: `reply-${reply.id}`,
      at: reply.receivedAt.toISOString(),
      kind: "reply",
      title: "Reply binnengekomen",
      detail: reply.bodyPreview ?? reply.subject,
      status: reply.sentiment ?? "reply",
    });
  }

  for (const note of notes) {
    timeline.push({
      id: note.id,
      at: note.at,
      kind: note.kind,
      title:
        note.kind === "call"
          ? "Gebeld"
          : note.kind === "linkedin"
            ? "LinkedIn"
            : "Notitie",
      detail: note.body,
    });
  }

  if (typeof meta.kvkEnrichedAt === "string") {
    timeline.push({
      id: `kvk-${p.id}`,
      at: meta.kvkEnrichedAt,
      kind: "kvk",
      title: "KvK-profiel opgehaald",
      detail: [
        p.kvkNumber ? `KvK ${p.kvkNumber}` : null,
        p.employeeCount != null ? `${p.employeeCount} mdw` : null,
        p.city,
        p.anniversaryYears != null ? `${p.anniversaryYears} jr` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  for (const lead of leadRows) {
    timeline.push({
      id: `lead-${lead.id}`,
      at: lead.createdAt.toISOString(),
      kind: "lead",
      title: "Warme lead",
      detail: lead.summary,
    });
  }

  timeline.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const lastTouch = timeline[0]?.at ?? p.updatedAt.toISOString();

  return {
    source: "db",
    dossier: {
      ...mapRecord(p, {
        mailCount: mails.filter((m) => m.status !== "draft").length,
        replyCount: replies.length,
        lastTouchAt: lastTouch,
      }),
      notes,
      timeline,
      lastLead: leadRows[0]
        ? {
            summary: leadRows[0].summary,
            createdAt: leadRows[0].createdAt.toISOString(),
          }
        : null,
    },
  };
}

export async function addCrmNote(input: {
  prospectId: string;
  kind: CrmNote["kind"];
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasDatabase()) return { ok: false, error: "Geen database" };
  const body = input.body.trim();
  if (body.length < 2) return { ok: false, error: "Schrijf een korte notitie" };

  const db = getDb();
  const [row] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1);
  if (!row) return { ok: false, error: "Bedrijf niet gevonden" };

  const meta = { ...(row.metadata ?? {}) };
  const notes = notesFromMeta(meta);
  notes.unshift({
    id: crypto.randomUUID(),
    kind: input.kind,
    body,
    at: new Date().toISOString(),
  });
  meta.crmNotes = notes;

  await db
    .update(prospects)
    .set({ metadata: meta, updatedAt: new Date() })
    .where(eq(prospects.id, input.prospectId));

  return { ok: true };
}

export async function saveLinkedinEstimate(input: {
  prospectId: string;
  estimate: number;
  linkedinUrl?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasDatabase()) return { ok: false, error: "Geen database" };
  if (!Number.isFinite(input.estimate) || input.estimate < 1) {
    return { ok: false, error: "Vul een schatting in (aantal mensen)" };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1);
  if (!row) return { ok: false, error: "Bedrijf niet gevonden" };

  const meta = { ...(row.metadata ?? {}) };
  const estimate = Math.round(input.estimate);
  meta.linkedinEmployeeEstimate = estimate;
  meta.linkedinEstimatedAt = new Date().toISOString();
  const scored = scoreDoelgroep({
    employeeCount: estimate,
    city: row.city,
  });
  meta.doelgroepFit = scored.fit;
  meta.doelgroepReason = `Schatting ~${estimate} · ${scored.reason}`;

  await db
    .update(prospects)
    .set({
      metadata: meta,
      employeeCount: estimate,
      linkedinUrl: input.linkedinUrl?.trim() || row.linkedinUrl,
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, input.prospectId));

  return { ok: true };
}
