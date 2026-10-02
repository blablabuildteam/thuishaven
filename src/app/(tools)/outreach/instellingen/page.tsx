import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { OutreachSettingsForm } from "@/components/outreach/outreach-settings-form";
import {
  formatCadenceSummary,
  loadOutreachSettings,
} from "@/lib/outreach/settings";

export const metadata = { title: "Instellingen · Outreach" };
export const dynamic = "force-dynamic";

export default async function OutreachSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/outreach/crm");

  const settings = await loadOutreachSettings();

  return (
    <div>
      <SectionHeader
        eyebrow="Alleen admin"
        title="Instellingen"
        description="Afzender, reply-to en verzendritme. Thuishaven vult dit in vóór live send — de Wachtrij gebruikt het ritme voor planningsuggesties."
      />
      <p className="mb-6 text-sm text-text-muted">
        Huidig ritme: {formatCadenceSummary(settings)}
      </p>
      <OutreachSettingsForm initial={settings} />
    </div>
  );
}
