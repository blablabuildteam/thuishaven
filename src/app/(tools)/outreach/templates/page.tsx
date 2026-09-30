import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TemplatesWorkbench } from "@/components/outreach/templates-workbench";
import { listEditableTemplates } from "@/lib/outreach/templates";
import { getBrochureUrl } from "@/lib/outreach/body-templates";
import { getTemplateStats } from "@/lib/outreach/template-stats";
import { bestTemplateKey } from "@/lib/outreach/template-stat-label";

export const metadata = { title: "Mailtemplates" };
export const dynamic = "force-dynamic";

export default async function OutreachTemplatesPage() {
  const [templates, stats] = await Promise.all([
    listEditableTemplates(),
    getTemplateStats(),
  ]);
  const brochureUrl = getBrochureUrl();

  return (
    <div>
      <SectionHeader
        eyebrow="Mailen"
        title="Mailtemplates"
        description="Bekijk, pas aan, stuur een test. In Mailen kies je daarna per batch welke template."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">{templates.length} templates</StatusBadge>
            <Link
              href="/outreach/emails"
              className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
            >
              Naar Mailen →
            </Link>
          </div>
        }
      />

      <TemplatesWorkbench
        initial={templates}
        brochureUrl={brochureUrl}
        stats={stats}
        bestTemplate={bestTemplateKey(stats)}
      />
    </div>
  );
}
