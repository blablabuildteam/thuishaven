import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import {
  OutreachEmailWorkbench,
  type WorkbenchProspect,
} from "@/components/outreach/email-workbench";
import { listCrmRecords } from "@/lib/outreach/crm";
import { leadScore } from "@/lib/outreach/lead-score";
import { getTemplateStats } from "@/lib/outreach/template-stats";
import { bestTemplateKey } from "@/lib/outreach/template-stat-label";
import {
  mailAngleFor,
  suggestedVariantForAngle,
} from "@/lib/outreach/mail-angle";
import { ClearHandoffCookie } from "@/components/outreach/clear-handoff-cookie";
import { peekHandoff } from "@/lib/outreach/handoff";
import { hasOutreachAiConfigured } from "@/lib/integrations/outreach";
import { resolveOutreachTestRecipient } from "@/lib/outreach/send-policy";
import type { OutreachVariantId } from "@/lib/outreach/tone";

export const metadata = { title: "Mailen" };
export const dynamic = "force-dynamic";

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; prospect?: string }>;
}) {
  const [
    { rows: records },
    templateStats,
    params,
    testTo,
    handoff,
  ] = await Promise.all([
    listCrmRecords(),
    getTemplateStats(),
    searchParams,
    resolveOutreachTestRecipient(),
    peekHandoff(),
  ]);
  const handoffIds = handoff.prospectIds;
  const handoffVariantId = handoff.variantId ?? null;
  const preselectIds = [
    ...new Set([
      ...handoffIds,
      ...(params.ids?.split(",") ?? []),
      ...(params.prospect ? [params.prospect] : []),
    ]),
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const workbenchProspects: WorkbenchProspect[] = [];
  let skippedNoEmail = 0;
  let inQueueCount = 0;
  for (const r of records) {
    if (
      r.type !== "company" ||
      r.partner ||
      r.existingCustomer ||
      r.nonMailing
    ) {
      continue;
    }
    const angle = mailAngleFor({
      status: r.status,
      existingCustomer: r.existingCustomer,
      doelgroepFit: r.doelgroepFit,
      doelgroepReason: r.doelgroepReason,
      anniversaryYears: r.anniversaryYears,
      nonMailing: r.nonMailing,
    });
    const suggested = suggestedVariantForAngle(angle.id);
    if (!suggested) continue;
    if (r.mailCount === 0 && (r.queuedCount > 0 || r.draftCount > 0)) {
      inQueueCount += 1;
      continue;
    }
    if (!r.email) {
      skippedNoEmail += 1;
      continue;
    }
    const score = leadScore({
      doelgroepFit: r.doelgroepFit,
      angleId: angle.id,
      jubileeYearsAway: angle.jubileeYearsAway,
      hasEmail: true,
      hasContact: Boolean(r.decisionMakerName),
      openCount: r.openCount,
      clickCount: r.clickCount,
      replyCount: r.replyCount,
      status: r.status,
    });
    workbenchProspects.push({
      id: r.id,
      companyName: r.companyName,
      email: r.email,
      contactName: r.decisionMakerName ?? null,
      angleId: angle.id,
      suggestedVariantId: suggested as OutreachVariantId,
      suggestedLabel: angle.label,
      score: score.score,
      tier: score.tier,
      mailCount: r.mailCount,
      queuedCount: r.queuedCount,
      lastSentAt: r.lastSentAt,
      lastVariantKey: r.lastVariantKey,
      replyCount: r.replyCount,
    });
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Stap 3"
        title="Mailen"
        description="Vink bedrijven aan, kies de afzender en klik Genereer. AI schrijft elke mail persoonlijk; daarna lees en test je ze in de Wachtrij."
        action={
          <Link
            href="/outreach/planning"
            className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
          >
            Wachtrij →
          </Link>
        }
      />

      {handoffIds.length > 0 ? <ClearHandoffCookie /> : null}

      <OutreachEmailWorkbench
        prospects={workbenchProspects}
        defaultTestTo={testTo}
        templateStats={templateStats}
        bestTemplate={bestTemplateKey(templateStats)}
        preselectIds={preselectIds}
        handoffVariantId={handoffVariantId}
        skippedNoEmail={skippedNoEmail}
        inQueueCount={inQueueCount}
        aiConfigured={hasOutreachAiConfigured()}
      />

    </div>
  );
}
