import Image from "next/image";
import Link from "next/link";
import { AvailabilityCalendar } from "@/components/outreach/availability-calendar";
import { listAvailabilityDays } from "@/lib/outreach/availability";

export const metadata = {
  title: "Beschikbaarheid · Thuishaven B2B",
  description:
    "Live overzicht van beschikbare doordeweekse data bij Thuishaven voor bedrijfsevents.",
};
export const dynamic = "force-dynamic";

export default async function PublicAvailabilityPage() {
  const { days } = await listAvailabilityDays();
  const openCount = days.filter((d) => d.status === "available").length;

  return (
    <div className="th-public-agenda relative z-0 min-h-screen">
      <div className="th-public-agenda-sunburst" aria-hidden />
      <div className="th-public-agenda-grain" aria-hidden />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/brand/logo-mark.png"
                alt=""
                width={48}
                height={48}
                className="object-contain"
                priority
              />
              <div>
                <p className="font-display text-xs tracking-[0.2em] text-black/50">
                  B2B · Live agenda
                </p>
                <h1 className="font-display text-4xl tracking-[0.04em] text-black sm:text-5xl">
                  Thuishaven
                </h1>
              </div>
            </div>
            <Link
              href="mailto:evenement@thuishaven.nl"
              className="bg-black px-4 py-2.5 font-display text-sm tracking-[0.12em] text-white transition-opacity hover:opacity-90"
            >
              Vraag een tour aan
            </Link>
          </div>

          <div className="max-w-2xl border-b-2 border-[#fff201] pb-4">
            <p className="text-sm leading-relaxed text-black/60 sm:text-base">
              Actuele doordeweekse beschikbaarheid voor bedrijfsevents. Data met
              een kruis zijn dicht. Prijzen dynamisch, excl. BTW.
            </p>
          </div>

          <p className="mt-4 font-display text-sm tracking-[0.14em] text-black/40">
            {openCount} slots beschikbaar · bijgewerkt live
          </p>
        </header>

        <AvailabilityCalendar days={days} publicView className="th-public-cal" />
      </div>
    </div>
  );
}
