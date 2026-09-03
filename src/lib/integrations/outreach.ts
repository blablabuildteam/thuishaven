/**
 * Outreach integrations — KvK (later), AI generation, Brevo send, sales notify.
 */

import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { leads, outreachEmails, prospects } from "@/lib/db/schema";
import { assertExternalReadOnly } from "@/lib/integrations/read-only";
import { availabilitySummaryForEmail } from "@/lib/outreach/availability";
import { getAgencyCampaignId } from "@/lib/outreach/data";
import {
  getOutreachBrevoKey,
  getOutreachSender,
  outreachSendBlockReason,
} from "@/lib/outreach/send-policy";
import {
  buildOutreachSystemPrompt,
  getOutreachVariant,
  type OutreachVariantId,
} from "@/lib/outreach/tone";
import { recordUsage } from "@/lib/usage/store";
import { PUBLIC_AVAILABILITY_URL } from "@/lib/mock/availability";

export type EnrichmentResult = {
  companyName: string;
  email?: string;
  employeeCount?: number;
  foundedAt?: string;
  ok: boolean;
  error?: string;
};

export async function searchKvkCompanies(_params: {
  city?: string;
  minEmployees?: number;
  maxEmployees?: number;
}): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!process.env.KVK_API_KEY) {
    return { ok: false, error: "KVK_API_KEY ontbreekt" };
  }
  return { ok: false, error: "Nog niet geïmplementeerd" };
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
    const model =
      process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
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
            temperature: 0.55,
            responseMimeType: "application/json",
          },
        }),
        cache: "no-store",
      },
    );
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Gemini HTTP ${res.status}: ${text.slice(0, 200)}` };
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
    if (!out) return { ok: false, error: "Leeg antwoord van Gemini" };
    return { ok: true, text: out, vendor: "gemini" };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.55,
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
  anniversaryYears?: number;
  availabilitySummary?: string;
  variantId?: OutreachVariantId;
  availabilityUrl?: string;
}): Promise<
  | { subject: string; body: string; variantId: OutreachVariantId }
  | { error: string }
> {
  const variant = getOutreachVariant(
    input.variantId ??
      (input.type === "agency"
        ? "open_dates"
        : input.anniversaryYears
          ? "jubileum"
          : "warm_tour"),
  );

  const availability =
    input.availabilitySummary ?? (await availabilitySummaryForEmail());
  const availabilityUrl = input.availabilityUrl ?? PUBLIC_AVAILABILITY_URL;

  const prompt = `Schrijf één outbound mail.

Variant: ${variant.name}
Guidance: ${variant.guidance}
Audience: ${input.type === "agency" ? "eventbureau" : "bedrijf"}
Bedrijf: ${input.companyName}
Contactpersoon: ${input.contactName ?? "onbekend"}
Sector: ${input.sector ?? "onbekend"}
Jubileum-jaren: ${input.anniversaryYears ?? "n.v.t."}
Availability summary:
${availability}
Availability URL: ${availabilityUrl}

JSON output verplicht.`;

  const llm = await callLlmJson(prompt);
  if (!llm.ok) return { error: llm.error };

  const parsed = parseJsonMail(llm.text);
  if (!parsed) {
    return { error: "AI gaf geen geldig subject/body JSON terug" };
  }

  try {
    await recordUsage({
      tool: "outreach",
      vendor: llm.vendor === "gemini" ? "other" : "openai",
      operation: "generate_outreach_email",
      units: 1,
      unitLabel: "mail",
      meta: { variant: variant.id, company: input.companyName },
    });
  } catch {
    /* usage logging optional */
  }

  return { ...parsed, variantId: variant.id };
}

/** Test mode only applies after OUTREACH_SEND_ENABLED unlock. */
export function resolveOutreachRecipients(intended: string[]): {
  to: string[];
  testMode: boolean;
  intended: string[];
} {
  const live = process.env.OUTREACH_LIVE_SEND?.trim() === "true";
  const testTo =
    process.env.OUTREACH_TEST_RECIPIENT?.trim() || "team@blablabuild.com";
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
 * Outreach send — HARD OFF by default.
 * Never uses marketing Brevo (BREVO_MCP_TOKEN / BREVO_API_KEY).
 */
export async function sendViaBrevo(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{
  messageId?: string;
  error?: string;
  testMode?: boolean;
  deliveredTo?: string[];
}> {
  const blocked = outreachSendBlockReason();
  if (blocked) return { error: blocked };

  const key = getOutreachBrevoKey();
  if (!key) return { error: "BREVO_OUTREACH_API_KEY ontbreekt" };

  const resolved = resolveOutreachRecipients([input.to]);
  const subject = resolved.testMode
    ? `[TEST → ${input.to}] ${input.subject}`
    : input.subject;
  const html = resolved.testMode
    ? `<p><strong>TESTMODE</strong> — bedoeld voor <code>${input.to}</code>.</p>${input.html}`
    : input.html;

  const sender = getOutreachSender();
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
        to: resolved.to.map((email) => ({ email })),
        subject,
        htmlContent: html,
        textContent: input.text,
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
        meta: { testMode: resolved.testMode, intended: input.to },
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
}): Promise<{ ok: boolean; error?: string; testMode?: boolean }> {
  const blocked = outreachSendBlockReason();
  if (blocked) return { ok: false, error: blocked };

  // Persist lead even when notify mail is blocked? No — full notify path locked.
  // Still allow DB lead create without mail when unlocked below.
  const key = getOutreachBrevoKey();
  if (!key) return { ok: false, error: "BREVO_OUTREACH_API_KEY ontbreekt" };

  const recipients = salesNotifyRecipients();
  const resolved = resolveOutreachRecipients(recipients);
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
  const sender = getOutreachSender();

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
    await db.insert(leads).values({
      prospectId: input.prospectId,
      outreachEmailId: input.outreachEmailId,
      summary: input.summary,
      notifiedAt: new Date(),
    });
    await db
      .update(prospects)
      .set({ status: "lead", updatedAt: new Date() })
      .where(eq(prospects.id, input.prospectId));
  }

  return { ok: true, testMode: resolved.testMode };
}

export async function generateAndStoreDraft(input: {
  prospectId: string;
  variantId?: OutreachVariantId;
}): Promise<
  | {
      emailId: string;
      subject: string;
      body: string;
      variantId: OutreachVariantId;
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

  const campaignId = await getAgencyCampaignId();
  if (!campaignId) return { error: "Geen campagne gevonden" };

  const generated = await generateOutreachEmail({
    type: prospect.type,
    companyName: prospect.companyName,
    sector: prospect.sector ?? undefined,
    anniversaryYears: prospect.anniversaryYears ?? undefined,
    variantId: input.variantId,
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
    })
    .returning();

  return {
    emailId: row!.id,
    subject: generated.subject,
    body: generated.body,
    variantId: generated.variantId,
  };
}

export async function sendStoredDraft(input: {
  emailId: string;
}): Promise<
  | {
      messageId?: string;
      testMode: boolean;
      deliveredTo: string[];
      intendedTo: string;
    }
  | { error: string }
> {
  const blocked = outreachSendBlockReason();
  if (blocked) return { error: blocked };

  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  const [row] = await db
    .select({
      id: outreachEmails.id,
      subject: outreachEmails.subject,
      body: outreachEmails.body,
      status: outreachEmails.status,
      email: prospects.email,
      companyName: prospects.companyName,
      prospectId: prospects.id,
      metadata: prospects.metadata,
      prospectStatus: prospects.status,
    })
    .from(outreachEmails)
    .innerJoin(prospects, eq(outreachEmails.prospectId, prospects.id))
    .where(eq(outreachEmails.id, input.emailId))
    .limit(1);

  if (!row) return { error: "Mail niet gevonden" };
  if (row.prospectStatus === "excluded") {
    return { error: "Prospect uitgesloten" };
  }

  const meta = (row.metadata ?? {}) as { contacts?: string[] };
  const intended =
    row.email ??
    (Array.isArray(meta.contacts) ? meta.contacts[0] : undefined);
  if (!intended) return { error: "Geen e-mailadres op prospect" };

  const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.5">${escapeHtml(row.body)}</pre>`;
  const sent = await sendViaBrevo({
    to: intended,
    subject: row.subject,
    html,
    text: row.body,
  });
  if (sent.error) return { error: sent.error };

  await db
    .update(outreachEmails)
    .set({
      status: "sent",
      brevoMessageId: sent.messageId ?? null,
      sentAt: new Date(),
    })
    .where(eq(outreachEmails.id, row.id));

  await db
    .update(prospects)
    .set({ status: "contacted", updatedAt: new Date() })
    .where(eq(prospects.id, row.prospectId));

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
