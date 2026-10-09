import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  OutreachEmailWorkbench,
  type WorkbenchProspect,
} from "@/components/outreach/email-workbench";
import { listOpenBatches } from "@/lib/outreach/batches";
import { listOutreachEmails } from "@/lib/outreach/data";
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
    { rows: emails, source },
    { rows: records },
    templateStats,
    params,
    openBatches,
    testTo,
    handoff,
  ] = await Promise.all([
    listOutreachEmails(),
    listCrmRecords(),
    getTemplateStats(),
    searchParams,
    listOpenBatches(),
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
    });
    const suggested = suggestedVariantForAngle(angle.id);
    if (!suggested) continue;
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
        description="Persoonlijke drafts genereren, testen, daarna in de Wachtrij reviewen en inplannen."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={source === "db" ? "success" : "neutral"}>
              {emails.length} drafts
            </StatusBadge>
            <Link
              href="/outreach/planning"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Wachtrij →
            </Link>
            <Link
              href="/outreach/templates"
              className="border border-border bg-surface px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
            >
              Templates
            </Link>
          </div>
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
        openBatches={openBatches}
        aiConfigured={hasOutreachAiConfigured()}
      />

      {emails.length === 0 ? (
        <p className="border-t border-border pt-6 text-sm text-text-muted">
          Nog geen eerdere drafts.
        </p>
      ) : (
        <section className="border-t border-border pt-6">
          <h2 className="mb-3 font-display text-lg tracking-[0.06em]">
            Eerdere drafts
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {emails.map((email) => (
              <li
                key={email.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {email.subject}
                  </p>
                  <p className="text-xs text-text-dim">
                    {email.prospectName}
                    {email.toEmail ? ` · ${email.toEmail}` : ""}
                  </p>
                </div>
                <StatusBadge tone="neutral">{email.status}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
