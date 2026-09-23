import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TemplatesWorkbench } from "@/components/outreach/templates-workbench";
import { listEditableTemplates } from "@/lib/outreach/templates";
import { getBrochureUrl } from "@/lib/outreach/body-templates";

export const metadata = { title: "Mailtemplates" };
export const dynamic = "force-dynamic";

export default async function OutreachTemplatesPage() {
  const templates = await listEditableTemplates();
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

      <TemplatesWorkbench initial={templates} brochureUrl={brochureUrl} />
    </div>
  );
}
