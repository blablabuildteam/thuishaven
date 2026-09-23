import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  generateAndStoreDraft,
  sendStoredDraft,
  sendViaBrevo,
} from "@/lib/integrations/outreach";
import { appendOutreachSignature } from "@/lib/outreach/tone";
import {
  listEditableTemplates,
  resetEditableTemplate,
  saveEditableTemplate,
} from "@/lib/outreach/templates";
import {
  fillBodyTemplate,
  getBrochureUrl,
} from "@/lib/outreach/body-templates";
import { getPublicAvailabilityUrl } from "@/lib/mock/availability";
import { logSessionActivity } from "@/lib/audit/session-log";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachEmails, prospects } from "@/lib/db/schema";
import { getCompanyCampaignId } from "@/lib/outreach/data";
import { eq } from "drizzle-orm";
import { renderOutreachHtmlEmail } from "@/lib/outreach/email-html";
import { getOutreachTestRecipient } from "@/lib/outreach/send-policy";

export const dynamic = "force-dynamic";

const VARIANT_IDS = [
  "warm_tour",
  "open_dates",
  "jubileum",
  "seizoen",
  "funding",
  "recordjaar",
  "short_checkin",
  "brochure",
] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const templates = await listEditableTemplates();
  return NextResponse.json({
    templates,
    brochureUrl: getBrochureUrl(),
    placeholders: ["{{companyName}}", "{{availabilityUrl}}", "{{brochureUrl}}"],
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action as string | undefined;

  if (action === "save") {
    const schema = z.object({
      action: z.literal("save"),
      id: z.enum(VARIANT_IDS),
      name: z.string().min(1).max(120),
      description: z.string().min(1).max(400),
      guidance: z.string().min(1).max(2000),
      subjectA: z.string().min(1).max(120),
      subjectB: z.string().min(1).max(120),
      bodyTemplate: z.string().min(1).max(8000),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await saveEditableTemplate(parsed.data);
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    await logSessionActivity(session, {
      action: "template_save",
      summary: `Template opgeslagen · ${parsed.data.id}`,
      path: "/api/outreach/templates",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { variantId: parsed.data.id },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "reset") {
    const schema = z.object({
      action: z.literal("reset"),
      id: z.enum(VARIANT_IDS),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }
    const result = await resetEditableTemplate(parsed.data.id);
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "test") {
    const schema = z.object({
      action: z.literal("test"),
      id: z.enum(VARIANT_IDS),
      subjectArm: z.enum(["a", "b"]).default("a"),
      companyName: z.string().min(1).max(120).default("Voorbeeld BV"),
      /** Optional: send as stored draft for a real prospect */
      prospectId: z.string().uuid().optional(),
      /** Inline body/subject override (unsaved editor state) */
      subject: z.string().min(1).max(200).optional(),
      bodyTemplate: z.string().min(1).max(8000).optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }

    if (parsed.data.prospectId) {
      const draft = await generateAndStoreDraft({
        prospectId: parsed.data.prospectId,
        variantId: parsed.data.id,
        subjectArm: parsed.data.subjectArm,
      });
      if ("error" in draft) {
        return NextResponse.json(draft, { status: 400 });
      }
      const sent = await sendStoredDraft({
        emailId: draft.emailId,
        forceTest: true,
      });
      if ("error" in sent) {
        return NextResponse.json(sent, { status: 400 });
      }
      return NextResponse.json({ ...sent, emailId: draft.emailId });
    }

    if (!hasDatabase()) {
      return NextResponse.json(
        { error: "Database nodig voor testmail" },
        { status: 400 },
      );
    }

    const availabilityUrl = getPublicAvailabilityUrl();
    const templates = await listEditableTemplates();
    const t = templates.find((x) => x.id === parsed.data.id);
    if (!t) {
      return NextResponse.json({ error: "Template niet gevonden" }, { status: 404 });
    }

    const subject =
      parsed.data.subject ??
      (parsed.data.subjectArm === "b" ? t.subjects.b : t.subjects.a);
    const rawBody = fillBodyTemplate(
      parsed.data.bodyTemplate ?? t.bodyTemplate,
      {
        companyName: parsed.data.companyName,
        availabilityUrl,
        brochureUrl: getBrochureUrl(),
      },
    );
    const bodyText = appendOutreachSignature(rawBody);
    const testTo = getOutreachTestRecipient();
    const html = renderOutreachHtmlEmail({
      body: bodyText,
      testBanner: `TEMPLATE-TEST · ${parsed.data.id} · bedoeld als voorbeeldmail`,
    });

    const sent = await sendViaBrevo({
      to: testTo,
      subject,
      html,
      text: bodyText,
      forceTest: true,
      tags: ["outreach", "template-test", parsed.data.id],
    });
    if (sent.error) {
      return NextResponse.json({ error: sent.error }, { status: 400 });
    }

    // Also store a draft against first company prospect if possible (for Resultaten).
    try {
      const db = getDb();
      const campaignId = await getCompanyCampaignId();
      const [anyProspect] = await db
        .select({ id: prospects.id })
        .from(prospects)
        .where(eq(prospects.type, "company"))
        .limit(1);
      if (campaignId && anyProspect) {
        await db.insert(outreachEmails).values({
          campaignId,
          prospectId: anyProspect.id,
          subject: `[TEMPLATE] ${subject}`,
          body: bodyText,
          status: "sent",
          variantKey: parsed.data.id,
          subjectKey: parsed.data.subjectArm,
          sentAt: new Date(),
        });
      }
    } catch {
      /* optional */
    }

    await logSessionActivity(session, {
      action: "template_test",
      summary: `Template-test · ${parsed.data.id}`,
      path: "/api/outreach/templates",
      method: "POST",
      status: 200,
      tool: "outreach",
      meta: { variantId: parsed.data.id },
    });

    return NextResponse.json(sent);
  }

  return NextResponse.json({ error: "Onbekende actie" }, { status: 400 });
}
