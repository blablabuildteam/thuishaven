import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import {
  OutreachEmailWorkbench,
  type WorkbenchContact,
  type WorkbenchProspect,
} from "@/components/outreach/email-workbench";
import {
  checkLabel,
  rankMailTargets,
  TARGET_TIER_LABEL,
  type EmailCheck,
  type RankableContact,
} from "@/lib/outreach/contact-ranking";
import { listCrmRecords } from "@/lib/outreach/crm";
import { countQueueItems } from "@/lib/outreach/queue";
import { leadScore } from "@/lib/outreach/lead-score";
import { checkRecipientEmail } from "@/lib/outreach/email-quality";
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

function availableContacts(r: {
  email: string | null;
  website: string | null;
  companyName: string;
  contacts: RankableContact[];
  emailChecks: Record<string, EmailCheck>;
  mailedEmails: string[];
  pendingEmails: string[];
}): WorkbenchContact[] {
  const { targets } = rankMailTargets({
    contacts: r.contacts,
    company: { website: r.website, companyName: r.companyName },
    companyEmail: r.email,
    checks: r.emailChecks,
    exclude: [...r.mailedEmails, ...r.pendingEmails],
  });
  return targets.map((t) => ({
    name: t.name,
    ...(t.title ? { title: t.title } : {}),
    email: t.email,
    tierLabel: TARGET_TIER_LABEL[t.tier],
    checkLabel: checkLabel(t.check),
    verified: t.check?.status === "valid",
  }));
}

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
    inQueueCount,
  ] = await Promise.all([
    listCrmRecords(),
    getTemplateStats(),
    searchParams,
    resolveOutreachTestRecipient(),
    peekHandoff(),
    countQueueItems(),
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

  const sharedCounts = new Map<string, number>();
  for (const r of records) {
    for (const c of r.contacts) {
      const key = c.email?.trim().toLowerCase();
      if (key) sharedCounts.set(key, (sharedCounts.get(key) ?? 0) + 1);
    }
    const key = r.email?.trim().toLowerCase();
    if (key) sharedCounts.set(key, Math.max(sharedCounts.get(key) ?? 0, 1));
  }

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
      nonMailing: r.nonMailing,
    });
    const suggested = suggestedVariantForAngle(angle.id);
    if (!suggested) continue;

    const contacts = availableContacts(r);
    if (contacts.length === 0) {
      const hasAnyEmail =
        Boolean(r.email) || r.contacts.some((c) => c.email);
      if (!hasAnyEmail) {
        skippedNoEmail += 1;
        continue;
      }
      // All contact emails already queued or mailed.
      continue;
    }

    const primary = contacts[0]!;
    const score = leadScore({
      doelgroepFit: r.doelgroepFit,
      angleId: angle.id,
      jubileeYearsAway: angle.jubileeYearsAway,
      hasEmail: true,
      hasContact: Boolean(primary.name),
      openCount: r.openCount,
      clickCount: r.clickCount,
      replyCount: r.replyCount,
      status: r.status,
    });
    workbenchProspects.push({
      id: r.id,
      companyName: r.companyName,
      email: primary.email,
      contactName: primary.name,
      contacts,
      quality: checkRecipientEmail({
        email: primary.email,
        contactName: primary.name,
        website: r.website,
        companyName: r.companyName,
        sharedCount: sharedCounts.get(primary.email.toLowerCase()) ?? 1,
      }),
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
        description="Vink bedrijven aan en genereer: elk mailbaar contact krijgt een eigen persoonlijke mail (max 3 per bedrijf)."
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
