import Image from "next/image";
import Link from "next/link";
import { PublicMonthCalendar } from "@/components/outreach/public-month-calendar";
import { listAvailabilityDays } from "@/lib/outreach/availability";
import { expandAvailabilityToFullMonths } from "@/lib/outreach/expand-availability-months";

export const metadata = {
  title: "Beschikbaarheid · Thuishaven B2B",
  description:
    "Live overzicht van beschikbare doordeweekse data bij Thuishaven voor bedrijfsevents.",
};
export const dynamic = "force-dynamic";

export default async function PublicAvailabilityPage() {
  const { days: raw } = await listAvailabilityDays();
  const days = expandAvailabilityToFullMonths(raw);
  const openCount = days.filter((d) => d.status === "available").length;

  return (
    <div className="th-public-agenda relative z-0 min-h-screen">
      <div className="th-public-agenda-sunburst" aria-hidden />
      <div className="th-public-agenda-grain" aria-hidden />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-10">
        <header className="mb-8 sm:mb-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6 sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/brand/logo-mark.png"
                alt=""
                width={48}
                height={48}
                className="size-10 shrink-0 object-contain sm:size-12"
                priority
              />
              <div className="min-w-0">
                <p className="font-display text-[10px] tracking-[0.2em] text-black/50 sm:text-xs">
                  B2B · Live agenda
                </p>
                <h1 className="font-display text-3xl tracking-[0.04em] text-black sm:text-4xl md:text-5xl">
                  Thuishaven
                </h1>
              </div>
            </div>
            <Link
              href="mailto:evenement@thuishaven.nl"
              className="w-full bg-black px-4 py-2.5 text-center font-display text-sm tracking-[0.12em] text-white transition-opacity hover:opacity-90 sm:w-auto"
            >
              Vraag een tour aan
            </Link>
          </div>

          <div className="max-w-3xl border-b-2 border-[#fff201] pb-4">
            <p className="text-sm leading-relaxed text-black/60 sm:text-base">
              Hele maand in één oogopslag. Dagen met “open” zijn boekbaar; dagen
              met een streep zijn dicht.
            </p>
          </div>

          <p className="mt-4 font-display text-sm tracking-[0.14em] text-black/40">
            {openCount} slots open · bijgewerkt live
          </p>
        </header>

        <PublicMonthCalendar days={days} />
      </div>
    </div>
  );
}
