import Image from "next/image";
import Link from "next/link";
import {
  AvailabilityCalendar,
  AvailabilityLegend,
} from "@/components/outreach/availability-calendar";
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
    <div className="relative z-0 min-h-screen bg-bg">
      <div className="hub-glow pointer-events-none absolute inset-0 opacity-80" />

      <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-10">
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
                <p className="font-display text-xs tracking-[0.2em] text-text-muted">
                  B2B · Live agenda
                </p>
                <h1 className="font-display text-4xl tracking-[0.04em] text-text sm:text-5xl">
                  Thuishaven
                </h1>
              </div>
            </div>
            <Link
              href="mailto:events@thuishaven.nl"
              className="bg-accent px-4 py-2.5 font-display text-sm tracking-[0.12em] text-accent-contrast transition-opacity hover:opacity-90"
            >
              Vraag een tour aan
            </Link>
          </div>

          <div className="rule-yellow max-w-2xl pb-4">
            <p className="max-w-2xl text-sm leading-relaxed text-text-muted sm:text-base">
              Actuele doordeweekse beschikbaarheid voor bedrijfsevents. Data met
              een kruis zijn dicht (eigen programmering, externe boeking of
              opbouw). Prijzen zijn dynamisch en excl. BTW.
            </p>
          </div>

          <p className="mt-4 font-display text-sm tracking-[0.14em] text-text-dim">
            {openCount} slots beschikbaar · bijgewerkt live
          </p>
        </header>

        <div className="mb-6">
          <AvailabilityLegend />
        </div>

        <AvailabilityCalendar days={days} publicView />

        <footer className="mt-12 border-t border-border pt-6 text-xs text-text-dim">
          <p>
            Thuishaven · Amsterdam West ·{" "}
            <a
              href="https://thuishaven.nl/"
              className="text-text-muted underline-offset-2 hover:underline"
            >
              thuishaven.nl
            </a>
          </p>
          <p className="mt-1">
            Prijzen indicatief · definitieve offerte via events@thuishaven.nl
          </p>
        </footer>
      </div>
    </div>
  );
}
