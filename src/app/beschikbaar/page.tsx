import Image from "next/image";
import Link from "next/link";
import { PublicAvailabilityAgenda } from "@/components/outreach/public-availability-agenda";
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

      <header className="relative z-10">
        <div className="bg-black px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
            <Image
              src="/brand/logo-wordmark-white.png"
              alt="Thuishaven"
              width={220}
              height={44}
              className="h-8 w-auto object-contain sm:h-10"
              priority
            />
            <p className="font-display text-sm tracking-[0.28em] text-white/70">
              B2B · Te huur
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 sm:pt-12">
          <div className="th-agenda-banner">
            <h1>Agenda</h1>
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-sm leading-relaxed text-black/65 sm:text-base">
            Doordeweekse beschikbaarheid voor bedrijfsevents. Open slots zijn
            boekbaar — prijzen dynamisch, excl. BTW. Zwarte / rode dagen zijn
            dicht.
          </p>
          <p className="mt-4 text-center font-display text-sm tracking-[0.18em] text-black/40">
            {openCount} open · live bijgewerkt
          </p>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <PublicAvailabilityAgenda days={days} />

        <div className="mt-12 flex flex-col items-center gap-4 border-t border-black/15 pt-8 text-center">
          <Link
            href="mailto:evenement@thuishaven.nl"
            className="bg-black px-6 py-3 font-display text-sm tracking-[0.18em] text-white transition-opacity hover:opacity-85"
          >
            Vraag een tour aan
          </Link>
          <p className="text-xs text-black/45">
            Contactweg 68, Amsterdam West ·{" "}
            <a
              href="https://thuishaven.nl/"
              className="underline-offset-2 hover:underline"
            >
              thuishaven.nl
            </a>
            <br />
            Offerte via evenement@thuishaven.nl
          </p>
        </div>
      </main>
    </div>
  );
}
