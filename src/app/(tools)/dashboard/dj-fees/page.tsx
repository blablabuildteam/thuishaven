import { DjFeesWorkbench } from "@/components/dashboard/dj-fees-workbench";
import { SectionHeader } from "@/components/ui/section-header";
import { monthKeyFromDay } from "@/lib/dashboard/dj-fee-ranges";
import { loadDjFeeBoard } from "@/lib/dashboard/dj-fees";
import { hasDatabase } from "@/lib/db/client";
import { amsterdamDay } from "@/lib/time/amsterdam";

export const metadata = { title: "DJ-fees" };
export const dynamic = "force-dynamic";

function defaultMonth(days: string[], today: string): string {
  const months = [...new Set(days.map(monthKeyFromDay))].sort();
  const current = monthKeyFromDay(today);
  if (months.includes(current)) return current;
  const next = months.find((month) => month >= current);
  return next ?? months[months.length - 1] ?? current;
}

export default async function DjFeesPage() {
  if (!hasDatabase()) {
    return (
      <div>
        <SectionHeader
          eyebrow="Alerts"
          title="DJ-fees"
          description="Geen DATABASE_URL."
        />
      </div>
    );
  }

  const events = await loadDjFeeBoard();
  const today = amsterdamDay(new Date());
  const initialMonth = defaultMonth(
    events.map((event) => event.day),
    today,
  );

  return (
    <DjFeesWorkbench initialEvents={events} initialMonth={initialMonth} />
  );
}
