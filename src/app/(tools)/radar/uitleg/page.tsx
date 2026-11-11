import Link from "next/link";
import { RadarPageHeader } from "@/components/radar/radar-page-header";
import { RADAR_SCORE_TOPICS } from "@/lib/radar/score-copy";

export const metadata = { title: "Uitleg · Radar" };
export const dynamic = "force-dynamic";

export default function RadarUitlegPage() {
  return (
    <div>
      <RadarPageHeader
        title="Hoe werken de scores?"
        description="Korte uitleg van alles wat Radar meet. Bij kolommen en KPI’s staat een i’tje dat hiernaartoe linkt."
      />

      <div className="mb-8 flex flex-wrap gap-3 text-sm">
        <Link href="/radar/artiesten" className="underline hover:text-text">
          ← Artiesten
        </Link>
        <Link href="/radar/venues" className="underline hover:text-text">
          Venues
        </Link>
      </div>

      <section className="mb-10 max-w-2xl space-y-3 text-sm leading-relaxed text-text-muted">
        <p>
          Radar is{" "}
          <strong className="text-text">multi-source</strong>: Resident
          Advisor, club-/festivalwebsites, Instagram van venues, en handmatige
          line-ups. Alles komt samen onder{" "}
          <a href="/radar/feesten" className="underline hover:text-text">
            Feesten
          </a>
          . Scores kijken naar boekingstraject (gigs, line-uppositie, venues);
          socials en Spotify bevestigen groei.
        </p>
        <p>
          Doel:{" "}
          <strong className="text-text">
            talent spotten op feesten, volgen, en boeken zolang het nog kan
          </strong>
          — niet de grootste namen van de week.
        </p>
      </section>

      <nav className="mb-10 flex flex-wrap gap-2 text-xs">
        {RADAR_SCORE_TOPICS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className="border border-border px-2 py-1 text-text-muted hover:border-accent hover:text-text"
          >
            {t.title}
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        {RADAR_SCORE_TOPICS.map((t) => (
          <article
            key={t.id}
            id={t.id}
            className="scroll-mt-24 border border-border bg-surface px-4 py-5 sm:px-5"
          >
            <h2 className="font-display text-xl tracking-[0.04em]">{t.title}</h2>
            <p className="mt-2 text-sm font-medium text-text">{t.short}</p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              {t.body}
            </p>
          </article>
        ))}
      </div>

      <section className="mt-12 max-w-2xl border border-dashed border-border px-4 py-5 text-sm text-text-muted">
        <h2 className="font-display text-lg tracking-[0.04em] text-text">
          Formule (kort)
        </h2>
        <p className="mt-2 font-mono text-xs text-text">
          totaal = 0.45 × momentum + 0.3 × fit + 0.25 × bookability
        </p>
        <p className="mt-3 leading-relaxed">
          Momentum: gigs 90d vs vorig kwartaal, billing omhoog, landen,
          RA-volgersgroei. Fit: early venues, NL, overlap met
          Thuishaven-artiesten. Bookable: nog niet te groot / te agency.
        </p>
      </section>
    </div>
  );
}
