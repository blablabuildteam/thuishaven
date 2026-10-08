import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { outreachTemplateOverrides } from "@/lib/db/schema";
import {
  DEFAULT_BODY_TEMPLATES,
  fillBodyTemplate,
  getBrochureUrl,
} from "./body-templates";
import {
  OUTREACH_VARIANTS,
  getOutreachVariant,
  type OutreachSubjectArm,
  type OutreachVariant,
  type OutreachVariantId,
} from "./tone";

export type EditableTemplate = {
  id: OutreachVariantId;
  name: string;
  description: string;
  guidance: string;
  audience: OutreachVariant["audience"];
  subjects: Record<OutreachSubjectArm, string>;
  bodyTemplate: string;
  /** true when saved override differs from code default */
  overridden: boolean;
};

function codeDefault(id: OutreachVariantId): EditableTemplate {
  const v = getOutreachVariant(id);
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    guidance: v.guidance,
    audience: v.audience,
    subjects: { ...v.subjects },
    bodyTemplate: DEFAULT_BODY_TEMPLATES[id],
    overridden: false,
  };
}

export async function listEditableTemplates(): Promise<EditableTemplate[]> {
  const base = OUTREACH_VARIANTS.map((v) => codeDefault(v.id));
  if (!hasDatabase()) return base;

  try {
    const db = getDb();
    const rows = await db.select().from(outreachTemplateOverrides);
    const byKey = new Map(rows.map((r) => [r.variantKey, r]));
    return base.map((t) => {
      const o = byKey.get(t.id);
      if (!o) return t;
      const body =
        typeof o.bodyTemplate === "string" && o.bodyTemplate.trim()
          ? o.bodyTemplate
          : t.bodyTemplate;
      return {
        ...t,
        name: o.name || t.name,
        description: o.description || t.description,
        guidance: o.guidance || t.guidance,
        subjects: {
          a: o.subjectA?.trim() ? o.subjectA : t.subjects.a,
          b: o.subjectB?.trim() ? o.subjectB : t.subjects.b,
        },
        bodyTemplate: body,
        overridden: true,
      };
    });
  } catch {
    return base;
  }
}

export async function getEditableTemplate(
  id: OutreachVariantId,
): Promise<EditableTemplate> {
  const all = await listEditableTemplates();
  return all.find((t) => t.id === id) ?? codeDefault(id);
}

export async function saveEditableTemplate(input: {
  id: OutreachVariantId;
  name: string;
  description: string;
  guidance: string;
  subjectA: string;
  subjectB: string;
  bodyTemplate: string;
}): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  try {
    await db
      .insert(outreachTemplateOverrides)
      .values({
        variantKey: input.id,
        name: input.name.trim(),
        description: input.description.trim(),
        guidance: input.guidance.trim(),
        subjectA: input.subjectA.trim(),
        subjectB: input.subjectB.trim(),
        bodyTemplate: input.bodyTemplate.trim(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: outreachTemplateOverrides.variantKey,
        set: {
          name: input.name.trim(),
          description: input.description.trim(),
          guidance: input.guidance.trim(),
          subjectA: input.subjectA.trim(),
          subjectB: input.subjectB.trim(),
          bodyTemplate: input.bodyTemplate.trim(),
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Opslaan mislukt",
    };
  }
}

export async function resetEditableTemplate(
  id: OutreachVariantId,
): Promise<{ ok: true } | { error: string }> {
  if (!hasDatabase()) return { error: "DATABASE_URL ontbreekt" };
  const db = getDb();
  try {
    await db
      .delete(outreachTemplateOverrides)
      .where(eq(outreachTemplateOverrides.variantKey, id));
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Reset mislukt",
    };
  }
}

/** Resolve subjects + body for generate (respects DB overrides). */
export async function resolveTemplateForSend(input: {
  variantId: OutreachVariantId;
  subjectArm: OutreachSubjectArm;
  companyName: string;
  availabilityUrl: string;
  contactFirstName?: string;
}): Promise<{ subject: string; body: string; guidance: string }> {
  const t = await getEditableTemplate(input.variantId);
  const subject =
    t.subjects[input.subjectArm] ||
    getOutreachVariant(input.variantId).subjects[input.subjectArm];
  const rawBody =
    t.bodyTemplate?.trim() ||
    DEFAULT_BODY_TEMPLATES[input.variantId] ||
    DEFAULT_BODY_TEMPLATES.warm_tour;
  const body = fillBodyTemplate(rawBody, {
    companyName: input.companyName,
    availabilityUrl: input.availabilityUrl,
    brochureUrl: getBrochureUrl(),
    contactFirstName: input.contactFirstName,
  });
  return { subject, body, guidance: t.guidance };
}
