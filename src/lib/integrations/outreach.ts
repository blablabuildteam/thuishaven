/**
 * Outreach integrations — KvK (later), AI generation, Brevo send, sales notify.
 */

import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  leads,
  outreachBatches,
  outreachEmails,
  prospects,
} from "@/lib/db/schema";
import { assertExternalReadOnly } from "@/lib/integrations/read-only";
import { availabilitySummaryForEmail } from "@/lib/outreach/availability";
import { getAgencyCampaignId, getCompanyCampaignId } from "@/lib/outreach/data";
import { renderOutreachHtmlEmail } from "@/lib/outreach/email-html";
import {
  applySenderSignature,
  DEFAULT_SENDER_PROFILE_ID,
  getSenderProfile,
  isSenderProfileId,
  snapshotSenderProfile,
  type OutreachSenderProfileId,
} from "@/lib/outreach/sender-profiles";
import {
  assertAllowedOutreachSender,
  getOutreachBrevoKey,
  outreachLiveSendBlockReason,
  outreachTestSendBlockReason,
  resolveOutreachReplyTo,
  resolveOutreachSender,
  resolveOutreachTestRecipient,
  resolveOutreachTestRecipientsAsync,
} from "@/lib/outreach/send-policy";
import {
  appendOutreachSignature,
  buildOutreachSystemPrompt,
  getOutreachVariant,
  pickSubjectArm,
  type OutreachSubjectArm,
  type OutreachVariantId,
} from "@/lib/outreach/tone";
import { resolveTemplateForSend } from "@/lib/outreach/templates";
import { getBrochureUrl } from "@/lib/outreach/body-templates";
import {
  MAIL_CAMPAIGN_ANGLES,
  mailAngleFor,
  nextJubilee,
} from "@/lib/outreach/mail-angle";
import { recordUsage } from "@/lib/usage/store";
import { getPublicAvailabilityUrl } from "@/lib/mock/availability";

import { discoverCompanyProspects } from "@/lib/integrations/kvk";

export type EnrichmentResult = {
  companyName: string;
  email?: string;
  employeeCount?: number;
  foundedAt?: string;
  ok: boolean;
  error?: string;
};

export async function searchKvkCompanies(params: {
  naam?: string;
  kvkNummer?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  count?: number;
  candidates?: Awaited<ReturnType<typeof discoverCompanyProspects>>["candidates"];
  skipped?: Awaited<ReturnType<typeof discoverCompanyProspects>>["skipped"];
}> {
  const result = await discoverCompanyProspects({
    naam: params.naam,
    kvkNummer: params.kvkNummer,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    count: result.candidates.length,
    candidates: result.candidates,
    skipped: result.skipped,
  };
}

function parseJsonMail(raw: string): { subject: string; body: string } | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1]?.trim() ?? trimmed;
  try {
    const parsed = JSON.parse(jsonText) as {
      subject?: unknown;
      body?: unknown;
    };
    if (
      typeof parsed.subject === "string" &&
      typeof parsed.body === "string" &&
      parsed.subject.trim() &&
      parsed.body.trim()
    ) {
      return { subject: parsed.subject.trim(), body: parsed.body.trim() };
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function callLlmJson(prompt: string): Promise<
  { ok: true; text: string; vendor: "openai" | "gemini" } | { ok: false; error: string }
> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!openaiKey && !geminiKey) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY of GEMINI_API_KEY ontbreekt. Zet een AI-key in .env.local / Vercel.",
    };
  }

  if (geminiKey) {
    const preferred = process.env.GEMINI_MODEL?.trim();
    const models = [
      ...new Set(
        [
          preferred,
          "gemini-3.8-flash",
          "gemini-3.7-flash",
          "gemini-3.6-flash",
          "gemini-3.5-flash",
          "gemini-flash-latest",
        ].filter(
          (m): m is string => Boolean(m),
        ),
      ),
    ];
    let lastError = "Geen bruikbaar Gemini-model";
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: buildOutreachSystemPrompt() }],
            },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.9,
              responseMimeType: "application/json",
            },
          }),
          cache: "no-store",
        },
      );
      const text = await res.text();
      if (!res.ok) {
        lastError = `Gemini HTTP ${res.status}: ${text.slice(0, 200)}`;
        // Missing model or overloaded/rate-limited: try the next model.
        if (
          res.status === 404 ||
          res.status === 429 ||
          res.status >= 500 ||
          /no longer available|not found|unknown model|high demand/i.test(text)
        ) {
          continue;
        }
        return { ok: false, error: lastError };
      }
      const data = JSON.parse(text) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const out = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!out) {
        lastError = "Leeg antwoord van Gemini";
        continue;
      }
      return { ok: true, text: out, vendor: "gemini" };
    }
    return { ok: false, error: lastError };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildOutreachSystemPrompt() },
        { role: "user", content: prompt },
      ],
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `OpenAI HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) return { ok: false, error: "Leeg antwoord van OpenAI" };
  return { ok: true, text: out, vendor: "openai" };
}

export async function generateOutreachEmail(input: {
  type: "company" | "agency";
  companyName: string;
  contactName?: string;
  sector?: string;
  city?: string;
  employeeCount?: number;
  anniversaryYears?: number;
  jubileeMark?: number;
  jubileeYearsAway?: number;
  /** Chip label we achterhaalden (bijv. "Jubileum 10 jr"). */
  angleLabel?: string;
  /** Uitleg bij die label (waarom deze haak). */
  angleDetail?: string;
  availabilitySummary?: string;
  variantId?: OutreachVariantId;
  subjectArm?: OutreachSubjectArm;
  availabilityUrl?: string;
  /** Handtekening + ondertekening volgen deze afzender. */
  senderProfileId?: OutreachSenderProfileId;
}): Promise<
  | {
      subject: string;
      body: string;
      variantId: OutreachVariantId;
      subjectKey: OutreachSubjectArm;
      /** ai = LLM rewrite; template = no AI key; template_fallback = AI failed. */
      source: "ai" | "template" | "template_fallback";
      fallbackReason?: string;
    }
  | { error: string }
> {
  const variantId: OutreachVariantId =
    input.variantId ??
    (input.type === "agency"
      ? "open_dates"
      : input.jubileeMark != null || input.anniversaryYears
        ? "jubileum"
        : "warm_tour");

  const variant = getOutreachVariant(variantId);
  const subjectKey =
    input.subjectArm ??
    pickSubjectArm(`${input.companyName}:${variantId}:${Date.now()}`);

  const availability =
    input.availabilitySummary ?? (await availabilitySummaryForEmail());
  const availabilityUrl = input.availabilityUrl ?? getPublicAvailabilityUrl();

  const resolved = await resolveTemplateForSend({
    variantId,
    subjectArm: subjectKey,
    companyName: input.companyName,
    availabilityUrl,
    contactFirstName: input.contactName?.trim().split(/\s+/)[0],
  });
  const subject = resolved.subject;
  const senderProfile = getSenderProfile(input.senderProfileId);
  const sign = (body: string) => applySenderSignature(body, senderProfile);
  const angleLabel = input.angleLabel?.trim() || variant.name;
  const angleDetail =
    input.angleDetail?.trim() || variant.description || resolved.guidance;

  const hasAi =
    Boolean(process.env.OPENAI_API_KEY?.trim()) ||
    Boolean(process.env.GEMINI_API_KEY?.trim());

  if (!hasAi) {
    return {
      subject,
      body: sign(resolved.body),
      variantId,
      subjectKey,
      source: "template",
      fallbackReason:
        "Geen AI-key — standaardtemplate (geen persoonlijke AI-mail)",
    };
  }

  const jubileeLine =
    input.jubileeMark != null
      ? input.jubileeYearsAway === 0
        ? `${input.jubileeMark}-jarig jubileum dit jaar`
        : `${input.jubileeMark}-jarig jubileum over ~${input.jubileeYearsAway} jaar (bedrijf ~${input.anniversaryYears ?? "?"} jaar oud)`
      : input.anniversaryYears != null
        ? `Bedrijf ~${input.anniversaryYears} jaar oud`
        : "geen jubileum-signaal";

  const seedHint = `${input.companyName}:${variantId}:${subjectKey}:${Date.now() % 97}`;
  const prompt = `Schrijf één persoonlijke outbound mail voor precies dit bedrijf. Altijd AI-origineel — geen template-gevoel.

GEKOZEN INVALSHOEK (aanhouden — dit hebben we voor dit bedrijf achterhaald):
- Label: ${angleLabel}
- Template/variant: ${variant.name} (${variantId})
- Waarom deze haak: ${angleDetail}
- Schrijfstijl-guidance: ${resolved.guidance}

Template-body hieronder = alleen referentie voor structuur/onderwerpen. Herschrijf VOLLEDIG in eigen woorden voor ${input.companyName}. Kopieer geen zinnen 1-op-1.
---
${resolved.body}
---

Feiten:
- Bedrijf: ${input.companyName}
- Contact: ${input.contactName ?? "onbekend (begin met Hi,)"}
- Sector: ${input.sector ?? "onbekend"}
- Plaats: ${input.city ?? "onbekend"}
- Medewerkers (schatting): ${input.employeeCount ?? "onbekend"}
- Jubileum-signaal: ${jubileeLine}
- Audience: ${input.type === "agency" ? "eventbureau" : "bedrijf"}

Subject (vast, arm ${subjectKey.toUpperCase()} — NIET wijzigen): ${subject}
Brochure-URL (alleen noemen bij brochure-variant): ${getBrochureUrl()}
Availability (optioneel, kort): ${availability}
Availability URL: ${availabilityUrl}

Eisen:
1. Opening en tweede zin specifiek voor ${input.companyName}
2. De gekozen invalshoek (${angleLabel}) merkt de lezer — natuurlijk, niet geforceerd
3. Bij jubileum: noem concrete jaren/mark als bekend; anders geen verzonnen jubileum
4. Max één zachte vraag / CTA
5. ~80–140 woorden, plain text, natuurlijk en foutloos Nederlands
6. Noem NOOIT wat je niet weet of niet kon vinden (geen "ik kon online niet vinden…", geen "onbekend"). Ontbrekende feiten laat je gewoon weg.
7. Geen handtekening, naam of contactgegevens onderaan — die plakken we er zelf onder (afzender: ${senderProfile.name}). Eindig met een korte afsluiter zoals "Groet," of "Spreek je snel,".
8. Variatie-seed (negeer inhoudelijk, gebruik om anders te schrijven): ${seedHint}

JSON verplicht: {"subject":"${subject.replace(/"/g, '\\"')}","body":"..."}`;

  // Retry with backoff — we want AI-personal mails, not silent template copies.
  let llm = await callLlmJson(prompt);
  for (const waitMs of [1500, 4000]) {
    if (llm.ok) break;
    await new Promise((r) => setTimeout(r, waitMs));
    llm = await callLlmJson(prompt);
  }
  if (!llm.ok) {
    return {
      subject,
      body: sign(resolved.body),
      variantId,
      subjectKey,
      source: "template_fallback",
      fallbackReason: llm.error || "AI gaf geen bruikbaar antwoord",
    };
  }

  let parsed = parseJsonMail(llm.text);
  if (!parsed) {
    llm = await callLlmJson(prompt);
    parsed = llm.ok ? parseJsonMail(llm.text) : null;
  }
  if (!parsed || !llm.ok) {
    return {
      subject,
      body: sign(resolved.body),
      variantId,
      subjectKey,
      source: "template_fallback",
      fallbackReason: "AI-antwoord was geen geldige JSON-mail",
    };
  }

  try {
    await recordUsage({
      tool: "outreach",
      vendor: llm.vendor === "gemini" ? "other" : "openai",
      operation: "generate_outreach_email",
      units: 1,
      unitLabel: "mail",
      meta: {
        variant: variantId,
        subjectKey,
        company: input.companyName,
        angleLabel,
      },
    });
  } catch {
    /* usage logging optional */
  }

  return {
    subject,
    body: sign(parsed.body),
    variantId,
    subjectKey,
    source: "ai",
  };
}

export async function resolveOutreachRecipients(intended: string[]): Promise<{
  to: string[];
  testMode: boolean;
  intended: string[];
}> {
  const live =
    process.env.OUTREACH_LIVE_SEND?.trim() === "true" &&
    process.env.OUTREACH_SEND_ENABLED?.trim() === "true";
  const testTo = await resolveOutreachTestRecipient();
  if (live) {
    return { to: intended, testMode: false, intended };
  }
  return { to: [testTo], testMode: true, intended };
}

export function salesNotifyRecipients(): string[] {
  const raw =
    process.env.SALES_NOTIFY_EMAIL?.trim() ||
    "reijner@thuishaven.nl,yoram@thuishaven.nl";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Outreach send via Brevo.
 * Default = testmode (team@). Live prospects only with OUTREACH_SEND_ENABLED + LIVE.
 */
export async function sendViaBrevo(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tags?: string[];
  /** Force test recipient even if live flags are on */
  forceTest?: boolean;
  /** Override test inboxes (allowlisted domains only) */
  testTo?: string[];
  /** Override From (batch sender). Falls back to global settings. */
  sender?: { email: string; name: string };
  /** Override Reply-To. Falls back to global settings. */
  replyTo?: { email: string; name: string };
}): Promise<{
  messageId?: string;
  error?: string;
  testMode?: boolean;
  deliveredTo?: string[];
}> {
  const forceTest = input.forceTest !== false; // default: test only
  if (forceTest) {
    const blocked = outreachTestSendBlockReason();
    if (blocked) return { error: blocked };
  } else {
    const blocked = outreachLiveSendBlockReason();
    if (blocked) return { error: blocked };
  }

  const key = getOutreachBrevoKey();
  if (!key) return { error: "Geen Brevo API-key" };

  const resolved = forceTest
    ? {
        to: await resolveOutreachTestRecipientsAsync(input.testTo),
        testMode: true as const,
        intended: [input.to],
      }
    : { to: [input.to], testMode: false as const, intended: [input.to] };

  const subject = resolved.testMode
    ? `[TEST → ${input.to}] ${input.subject}`
    : input.subject;
  // HTML is pre-rendered with optional test banner by the caller.
  const html = input.html;

  const sender = input.sender ?? (await resolveOutreachSender());
  const replyTo = input.replyTo ?? (await resolveOutreachReplyTo());
  const url = "https://api.brevo.com/v3/smtp/email";
  assertExternalReadOnly("POST", url, { allowTransactionalEmailPost: true });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": key,
      },
      body: JSON.stringify({
        sender,
        replyTo,
        to: resolved.to.map((email) => ({ email })),
        subject,
        htmlContent: html,
        textContent: input.text,
        tags: input.tags ?? ["outreach", "thuishaven-b2b"],
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      message?: string;
    };
    if (!res.ok) {
      return { error: data.message ?? `Brevo HTTP ${res.status}` };
    }

    try {
      await recordUsage({
        tool: "outreach",
        vendor: "brevo",
        operation: "send_outreach_email",
        units: 1,
        unitLabel: "email",
        meta: {
          testMode: resolved.testMode,
          intended: input.to,
          sender: sender.email,
        },
      });
    } catch {
      /* optional */
    }

    return {
      messageId: data.messageId,
      testMode: resolved.testMode,
      deliveredTo: resolved.to,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function notifySalesTeam(input: {
  companyName: string;
  summary: string;
  email?: string;
  prospectId?: string;
  outreachEmailId?: string;
  persistLead?: boolean;
}): Promise<{ ok: boolean; error?: string; testMode?: boolean }> {
  const blocked = outreachTestSendBlockReason();
  if (blocked) return { ok: false, error: blocked };

  const key = getOutreachBrevoKey();
  if (!key) return { ok: false, error: "BREVO_API_KEY ontbreekt" };

  const recipients = salesNotifyRecipients();
  const resolved = await resolveOutreachRecipients(recipients);
  const subject = resolved.testMode
    ? `[TEST lead] ${input.companyName}`
    : `Nieuwe warme lead · ${input.companyName}`;

  const html = `
    <h2>Warme lead — Thuishaven Outreach</h2>
    <p><strong>Bedrijf:</strong> ${escapeHtml(input.companyName)}</p>
    ${input.email ? `<p><strong>Contact:</strong> ${escapeHtml(input.email)}</p>` : ""}
    <p><strong>Samenvatting:</strong></p>
    <p>${escapeHtml(input.summary)}</p>
  `;

  const url = "https://api.brevo.com/v3/smtp/email";
  assertExternalReadOnly("POST", url, { allowTransactionalEmailPost: true });
  const sender = await resolveOutreachSender();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": key,
      },
      body: JSON.stringify({
        sender,
        to: resolved.to.map((email) => ({ email })),
        subject,
        htmlContent: html,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: data.message ?? `Brevo HTTP ${res.status}` };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }

  if (hasDatabase() && input.prospectId) {
    const db = getDb();
    if (input.persistLead !== false) {
      await db.insert(leads).values({
        prospectId: input.prospectId,
        outreachEmailId: input.outreachEmailId,
        summary: input.summary,
        notifiedAt: new Date(),
      });
    } else {
      await db
        .update(leads)
        .set({ notifiedAt: new Date() })
        .where(eq(leads.prospectId, input.prospectId));
    }
    await db
      .update(prospects)
      .set({ status: "lead", updatedAt: new Date() })
      .where(eq(prospects.id, input.prospectId));
  }

  return { ok: true, testMode: resolved.testMode };
}

export function hasOutreachAiConfigured(): boolean {
  return (
    Boolean(process.env.OPENAI_API_KEY?.trim()) ||
    Boolean(process.env.GEMINI_API_KEY?.trim())
  );
}

export async function generateAndStoreDraft(input: {
  prospectId: string;
  variantId?: OutreachVariantId;
  subjectArm?: OutreachSubjectArm;
  senderProfileId?: OutreachSenderProfileId;
}): Promise<
  | {
      emailId: string;
      subject: string;
      body: string;
      variantId: OutreachVariantId;
      subjectKey: OutreachSubjectArm;
      source: "ai" | "template" | "template_fallback";
      fallbackReason?: string;
      senderProfileId: OutreachSenderProfileId;
    }
  | { error: string }
> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, input.prospectId))
    .limit(1);
  if (!prospect) return { error: "Prospect niet gevonden" };
  if (prospect.status === "excluded") {
    return { error: "Prospect staat op uitsluitingslijst" };
  }
  const meta = (prospect.metadata ?? {}) as Record<string, unknown>;
  if (meta.nonMailing === true) {
    return { error: "KvK non-mailing — dit bedrijf niet mailen" };
  }
  if (prospect.type === "agency" && meta.source === "bureau_import") {
    return { error: "Partnerbureau — geen cold mail" };
  }

  const profileId = input.senderProfileId ?? DEFAULT_SENDER_PROFILE_ID;
  if (!isSenderProfileId(profileId)) {
    return { error: "Ongeldig afzenderprofiel" };
  }
  const snap = snapshotSenderProfile(profileId);
  const allowed = await assertAllowedOutreachSender(snap.senderEmail);
  if ("error" in allowed) return allowed;

  const campaignId =
    prospect.type === "company"
      ? await getCompanyCampaignId()
      : await getAgencyCampaignId();
  if (!campaignId) return { error: "Geen campagne gevonden" };

  const dm =
    meta.decisionMaker && typeof meta.decisionMaker === "object"
      ? (meta.decisionMaker as { name?: string })
      : null;

  const angle = mailAngleFor({
    status: prospect.status,
    anniversaryYears: prospect.anniversaryYears,
    doelgroepFit:
      typeof meta.doelgroepFit === "string" ? meta.doelgroepFit : null,
  });
  const jubilee =
    prospect.anniversaryYears != null
      ? nextJubilee(prospect.anniversaryYears)
      : null;
  const angleVariant = MAIL_CAMPAIGN_ANGLES.find((a) => a.id === angle.id)
    ?.variantId as OutreachVariantId | undefined;

  const generated = await generateOutreachEmail({
    type: prospect.type,
    companyName: prospect.companyName,
    contactName: dm?.name,
    sector: prospect.sector ?? undefined,
    city: prospect.city ?? undefined,
    employeeCount: prospect.employeeCount ?? undefined,
    anniversaryYears: prospect.anniversaryYears ?? undefined,
    jubileeMark: jubilee?.mark ?? angle.jubileeMark,
    jubileeYearsAway: jubilee?.yearsAway ?? angle.jubileeYearsAway,
    angleLabel: angle.label,
    angleDetail: angle.detail,
    variantId: input.variantId ?? angleVariant,
    subjectArm: input.subjectArm,
    senderProfileId: snap.senderProfileId,
  });
  if ("error" in generated) return generated;

  const [row] = await db
    .insert(outreachEmails)
    .values({
      campaignId,
      prospectId: prospect.id,
      subject: generated.subject,
      body: generated.body,
      status: "draft",
      variantKey: generated.variantId,
      subjectKey: generated.subjectKey,
      generationSource: generated.source,
      senderProfileId: snap.senderProfileId,
      senderEmail: snap.senderEmail,
    })
    .returning();

  return {
    emailId: row!.id,
    subject: generated.subject,
    body: generated.body,
    variantId: generated.variantId,
    subjectKey: generated.subjectKey,
    source: generated.source,
    fallbackReason: generated.fallbackReason,
    senderProfileId: snap.senderProfileId,
  };
}

/** Re-run AI (or template) for an existing draft/queued mail. */
export async function regenerateStoredDraft(input: {
  emailId: string;
  variantId?: OutreachVariantId;
  subjectArm?: OutreachSubjectArm;
}): Promise<
  | {
      emailId: string;
      subject: string;
      body: string;
      variantId: OutreachVariantId;
      subjectKey: OutreachSubjectArm;
      source: "ai" | "template" | "template_fallback";
      fallbackReason?: string;
    }
  | { error: string }
> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [row] = await db
    .select({
      id: outreachEmails.id,
      status: outreachEmails.status,
      prospectId: outreachEmails.prospectId,
      variantKey: outreachEmails.variantKey,
      subjectKey: outreachEmails.subjectKey,
      senderProfileId: outreachEmails.senderProfileId,
    })
    .from(outreachEmails)
    .where(eq(outreachEmails.id, input.emailId))
    .limit(1);
  if (!row) return { error: "Mail niet gevonden" };
  if (row.status !== "draft" && row.status !== "queued") {
    return { error: "Alleen concepten of wachtrij-mails kun je hergenereren" };
  }

  const [prospect] = await db
    .select()
    .from(prospects)
    .where(eq(prospects.id, row.prospectId))
    .limit(1);
  if (!prospect) return { error: "Prospect niet gevonden" };

  const meta = (prospect.metadata ?? {}) as Record<string, unknown>;
  const dm =
    meta.decisionMaker && typeof meta.decisionMaker === "object"
      ? (meta.decisionMaker as { name?: string })
      : null;
  const angle = mailAngleFor({
    status: prospect.status,
    anniversaryYears: prospect.anniversaryYears,
    doelgroepFit:
      typeof meta.doelgroepFit === "string" ? meta.doelgroepFit : null,
  });
  const jubilee =
    prospect.anniversaryYears != null
      ? nextJubilee(prospect.anniversaryYears)
      : null;
  const angleVariant = MAIL_CAMPAIGN_ANGLES.find((a) => a.id === angle.id)
    ?.variantId as OutreachVariantId | undefined;

  const variantId =
    input.variantId ??
    (row.variantKey as OutreachVariantId | null) ??
    angleVariant;
  const subjectArm =
    input.subjectArm ??
    (row.subjectKey === "a" || row.subjectKey === "b"
      ? (row.subjectKey as OutreachSubjectArm)
      : undefined);

  const generated = await generateOutreachEmail({
    type: prospect.type,
    companyName: prospect.companyName,
    contactName: dm?.name,
    sector: prospect.sector ?? undefined,
    city: prospect.city ?? undefined,
    employeeCount: prospect.employeeCount ?? undefined,
    anniversaryYears: prospect.anniversaryYears ?? undefined,
    jubileeMark: jubilee?.mark ?? angle.jubileeMark,
    jubileeYearsAway: jubilee?.yearsAway ?? angle.jubileeYearsAway,
    angleLabel: angle.label,
    angleDetail: angle.detail,
    variantId,
    subjectArm,
    senderProfileId: isSenderProfileId(row.senderProfileId)
      ? row.senderProfileId
      : undefined,
  });
  if ("error" in generated) return generated;

  await db
    .update(outreachEmails)
    .set({
      subject: generated.subject,
      body: generated.body,
      variantKey: generated.variantId,
      subjectKey: generated.subjectKey,
      generationSource: generated.source,
      armedAt: null,
    })
    .where(eq(outreachEmails.id, row.id));

  return {
    emailId: row.id,
    subject: generated.subject,
    body: generated.body,
    variantId: generated.variantId,
    subjectKey: generated.subjectKey,
    source: generated.source,
    fallbackReason: generated.fallbackReason,
  };
}

export async function sendStoredDraft(input: {
  emailId: string;
  /** Always true for now unless live unlock */
  forceTest?: boolean;
  testTo?: string[];
}): Promise<
  | {
      messageId?: string;
      testMode: boolean;
      deliveredTo: string[];
      intendedTo: string;
    }
  | { error: string }
> {
  const forceTest = input.forceTest !== false;
  const blocked = forceTest
    ? outreachTestSendBlockReason()
    : outreachLiveSendBlockReason();
  if (blocked) return { error: blocked };

  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [row] = await db
    .select({
      id: outreachEmails.id,
      subject: outreachEmails.subject,
      body: outreachEmails.body,
      status: outreachEmails.status,
      batchId: outreachEmails.batchId,
      emailSenderProfileId: outreachEmails.senderProfileId,
      emailSenderEmail: outreachEmails.senderEmail,
      email: prospects.email,
      companyName: prospects.companyName,
      prospectId: prospects.id,
      metadata: prospects.metadata,
      prospectStatus: prospects.status,
      variantKey: outreachEmails.variantKey,
      subjectKey: outreachEmails.subjectKey,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .where(eq(outreachEmails.id, input.emailId))
    .limit(1);

  if (!row) return { error: "Mail niet gevonden" };
  if (row.prospectStatus === "excluded") {
    return { error: "Prospect uitgesloten" };
  }
  if (!forceTest && row.status !== "queued") {
    return {
      error: `Live send alleen voor wachtrij-mails (status nu: ${row.status})`,
    };
  }
  const rawMeta = (row.metadata ?? {}) as Record<string, unknown>;
  if (rawMeta.nonMailing === true) {
    return { error: "KvK non-mailing — dit bedrijf niet mailen" };
  }
  if (rawMeta.source === "bureau_import") {
    return { error: "Partnerbureau — geen cold mail" };
  }

  const meta = rawMeta as { contacts?: string[] };
  const intended =
    row.email ??
    (Array.isArray(meta.contacts) ? meta.contacts[0] : undefined);
  if (!intended) return { error: "Geen e-mailadres op prospect" };

  // Prefer per-mail snapshot, then bakje, then global settings.
  let sender = await resolveOutreachSender();
  let replyTo = await resolveOutreachReplyTo();
  let bodyText = row.body;
  let senderProfileId: string | null = null;

  if (isSenderProfileId(row.emailSenderProfileId)) {
    const profile = getSenderProfile(row.emailSenderProfileId);
    senderProfileId = profile.id;
    sender = {
      email: row.emailSenderEmail || profile.email,
      name: profile.name,
    };
    replyTo = {
      email: profile.replyToEmail,
      name: profile.replyToName,
    };
    bodyText = applySenderSignature(row.body, profile);
  } else if (row.batchId) {
    const [batch] = await db
      .select({
        senderProfileId: outreachBatches.senderProfileId,
        senderEmail: outreachBatches.senderEmail,
        senderName: outreachBatches.senderName,
        replyToEmail: outreachBatches.replyToEmail,
        replyToName: outreachBatches.replyToName,
      })
      .from(outreachBatches)
      .where(eq(outreachBatches.id, row.batchId))
      .limit(1);
    if (batch) {
      const profile = getSenderProfile(
        isSenderProfileId(batch.senderProfileId)
          ? batch.senderProfileId
          : undefined,
      );
      senderProfileId = profile.id;
      sender = {
        email: batch.senderEmail || profile.email,
        name: batch.senderName || profile.name,
      };
      replyTo = {
        email: batch.replyToEmail || profile.replyToEmail,
        name: batch.replyToName || profile.replyToName,
      };
      bodyText = applySenderSignature(row.body, profile);
    }
  } else {
    bodyText = appendOutreachSignature(row.body);
  }

  const allowed = await assertAllowedOutreachSender(sender.email);
  if ("error" in allowed) return allowed;

  const html = renderOutreachHtmlEmail({
    body: bodyText,
    testBanner: forceTest
      ? `TESTMODE — bedoeld voor ${intended}, afgeleverd aan testadres. Open deze mail om open-tracking te valideren.`
      : null,
  });
  const tags = [
    "outreach",
    "thuishaven-b2b",
    row.variantKey ? `variant:${row.variantKey}` : null,
    row.subjectKey ? `subject:${row.subjectKey}` : null,
  ].filter((t): t is string => Boolean(t));

  // Claim the row before Brevo so two cron workers can't double-send.
  if (!forceTest) {
    const [claimed] = await db
      .update(outreachEmails)
      .set({
        status: "sent",
        sentAt: new Date(),
        senderEmail: sender.email,
        senderProfileId,
        armedAt: null,
      })
      .where(
        and(
          eq(outreachEmails.id, row.id),
          eq(outreachEmails.status, "queued"),
        ),
      )
      .returning({ id: outreachEmails.id });
    if (!claimed) {
      return { error: "Mail is al verstuurd of niet meer in de wachtrij" };
    }
  }

  const sent = await sendViaBrevo({
    to: intended,
    subject: row.subject,
    html,
    text: bodyText,
    tags,
    forceTest,
    testTo: input.testTo,
    sender,
    replyTo,
  });
  if (sent.error) {
    if (!forceTest) {
      // Roll back claim so the mail can be retried.
      await db
        .update(outreachEmails)
        .set({
          status: "queued",
          sentAt: null,
          senderEmail: sender.email,
          senderProfileId,
        })
        .where(eq(outreachEmails.id, row.id));
    }
    return { error: sent.error };
  }

  const storedMessageId = sent.messageId
    ? sent.messageId.replace(/^<|>$/g, "").trim()
    : null;

  // Test sends go to our own inbox: keep the draft a draft so team opens don't
  // count as prospect engagement and the company isn't marked as mailed.
  if (!forceTest) {
    await db
      .update(outreachEmails)
      .set({
        brevoMessageId: storedMessageId,
        senderEmail: sender.email,
        senderProfileId,
      })
      .where(eq(outreachEmails.id, row.id));
    await db
      .update(prospects)
      .set({ status: "contacted", updatedAt: new Date() })
      .where(eq(prospects.id, row.prospectId));
  }

  return {
    messageId: sent.messageId,
    testMode: Boolean(sent.testMode),
    deliveredTo: sent.deliveredTo ?? [],
    intendedTo: intended,
  };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
