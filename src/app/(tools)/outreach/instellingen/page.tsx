import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { OutreachSettingsForm } from "@/components/outreach/outreach-settings-form";
import { loadOutreachSettings } from "@/lib/outreach/settings";

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
        description="Afzender en reply-to. Het verzendritme bepalen wij op basis van data — dat staat alleen ter info."
      />
      <OutreachSettingsForm initial={settings} />
    </div>
  );
}
