import { OmzetBoard } from "@/components/dashboard/omzet-board";
import { SectionHeader } from "@/components/ui/section-header";
import { loadHorecaRevenueBoard, showOnOmzetBoard } from "@/lib/dashboard/horeca-revenue";
import { hasDatabase } from "@/lib/db/client";
import { amsterdamDay } from "@/lib/time/amsterdam";

export const metadata = { title: "Omzet" };
export const dynamic = "force-dynamic";

export default async function OmzetPage() {
  if (!hasDatabase()) {
    return (
      <div>
        <SectionHeader
          eyebrow="Omzet"
          title="Omzet"
          description="Geen DATABASE_URL."
        />
      </div>
    );
  }

  const events = await loadHorecaRevenueBoard();
  const today = amsterdamDay(new Date());
  const past = events.filter((event) => showOnOmzetBoard(event, today)).reverse();

  return <OmzetBoard past={past} />;
}
