import Link from "next/link";
import { OpenHashDetails } from "@/components/radar/open-hash-details";
import { RadarBadge, RadarBadgePill } from "@/components/radar/radar-badge";
import { RadarPageHeader } from "@/components/radar/radar-page-header";
import { RADAR_ALERT_DEFS } from "@/lib/radar/alert-defs";
import {
  RADAR_BADGE_GROUP_NL,
  RADAR_BADGES,
  type RadarBadgeGroup,
} from "@/lib/radar/badge-defs";
import { RADAR_SCORE_TOPICS } from "@/lib/radar/score-copy";

export const metadata = { title: "Uitleg · Radar" };

const FLOW = [
  {
    title: "Bronnen",
    body: "Radar leest de line-ups van onze clubs en festivals: RA, websites en Instagram.",
    href: "/radar/feesten",
    cta: "Feesten",
  },
  {
    title: "Artiestenlijst",
    body: "Elke naam uit een line-up komt automatisch op de lijst, met al hun gigs.",
    href: "/radar/artiesten",
    cta: "Artiesten",
  },
  {
    title: "Score",
    body: "Iedereen krijgt een score van 0 tot 100: groeit, past bij ons, nog te boeken?",
    href: "#score",
    cta: "Hoe telt dat?",
  },
  {
    title: "Badges en alerts",
    body: "Labels laten in één oogopslag zien wat opvalt. Alerts melden wat nú speelt.",
    href: "/radar/alerts",
    cta: "Alerts",
  },
  {
    title: "Jij beslist",
    body: "Zet een naam op Volgen, Shortlist of Gepasseerd. Radar blijft meten.",
    href: "/radar/artiesten?th=nieuw",
    cta: "Aan de slag",
  },
];

const PAGES = [
  {
    href: "/radar/artiesten",
    title: "Artiesten",
    use: "Ontdekken. Start met een snelfilter en zet kansrijke namen op Volgen.",
  },
  {
    href: "/radar/watchlist",
    title: "Watchlist",
    use: "Jouw Volgen/Shortlist. Hier meten we groei en sturen we Lanceert-alerts.",
  },
  {
    href: "/radar/alerts",
    title: "Alerts",
    use: "Wat er deze week veranderde: nieuwe namen, snelle groei, sets die hard gaan.",
  },
  {
    href: "/radar/feesten",
    title: "Feesten",
    use: "Per dag de line-ups van onze venues. Lichtblauwe namen zijn kansen: nieuw voor ons, hoge score.",
  },
  {
    href: "/radar/venues",
    title: "Clubs",
    use: "De clubs waar we scouten. Accepteer of wijs suggesties af — dat bepaalt waar Radar zoekt.",
  },
  {
    href: "/radar/festivals",
    title: "Festivals",
    use: "Festivals waar breakouts vroeg op staan. Line-ups komen via de RA-promoter.",
  },
];

const SCORE_PARTS = [
  {
    id: "momentum",
    name: "Momentum",
    weight: 45,
    color: "bg-text",
    question: "Groeit deze artiest?",
    signals: "Meer gigs dan vorig kwartaal, hoger op de line-up, meer landen, RA-volgers en sets bij mixseries.",
  },
  {
    id: "fit",
    name: "Fit",
    weight: 30,
    color: "bg-info",
    question: "Past dit bij Thuishaven?",
    signals: "Speelt bij early clubs uit onze startlijst, heeft een NL-publiek en deelt line-ups met Thuishaven-artiesten.",
  },
  {
    id: "bookability",
    name: "Boekbaarheid",
    weight: 25,
    color: "bg-success",
    question: "Kunnen we ze nog boeken?",
    signals: "Hoog als iemand nog niet te groot is. Veel volgers of een groot agency maken het lager.",
  },
];

const SCORE_LEVELS = [
  { range: "60+", label: "Sterk", body: "Bekijken. Ongeveer de top 15% van wie nieuw is voor ons." },
  { range: "45–60", label: "Interessant", body: "Volgen en terugkomen als er een alert komt." },
  { range: "< 45", label: "Nog vroeg", body: "Weinig data of weinig groei. Radar blijft meten." },
];

const BADGE_GROUPS: RadarBadgeGroup[] = ["groei", "nederland", "sets", "profiel"];

export default function RadarUitlegPage() {
  return (
    <div className="space-y-14">
      <OpenHashDetails />
      <RadarPageHeader
        title="Hoe werkt Radar?"
        description="Radar vindt DJ’s die groeien vóórdat ze groot zijn, zodat Thuishaven ze kan boeken zolang het nog kan. Niet de grootste namen van de week, wel de volgende."
        className="mb-0"
      />

      <section>
        <SectionTitle eyebrow="In 30 seconden" title="Van line-up naar boeking" />
        <ol className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {FLOW.map((step, i) => (
            <li key={step.title} className="flex flex-col bg-surface px-4 py-4">
              <span className="font-display text-3xl tabular-nums text-text-dim">
                {i + 1}
              </span>
              <p className="mt-1 font-medium">{step.title}</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-text-muted">
                {step.body}
              </p>
              <Link
                href={step.href}
                className="mt-3 text-xs font-medium underline underline-offset-2 hover:text-text"
              >
                {step.cta} →
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionTitle eyebrow="Thuishaven-status" title="Nieuw of al geweest?" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-border bg-surface px-4 py-4">
            <RadarBadgePill tone="muted">Nieuw voor Thuishaven</RadarBadgePill>
            <p className="mt-2 text-sm text-text-muted">
              Heeft nog nooit bij ons gedraaid. Dit is waar je naar zoekt. De
              artiestenlijst toont standaard alleen deze namen.
            </p>
          </div>
          <div className="border border-border bg-surface px-4 py-4">
            <RadarBadgePill tone="home">Al bij Thuishaven 2×</RadarBadgePill>
            <p className="mt-2 text-sm text-text-muted">
              Stond al op een Thuishaven-line-up. Handig als referentie: wie
              lijkt op artiesten die al werkten? Zet het filter op “Gespeeld”.
            </p>
          </div>
        </div>
      </section>

      <section id="score" className="scroll-mt-24">
        <SectionTitle eyebrow="De score" title="Drie vragen, één getal" />
        <div className="border border-border bg-surface">
          <div className="flex h-3" aria-hidden>
            {SCORE_PARTS.map((p) => (
              <div key={p.id} className={p.color} style={{ width: `${p.weight}%` }} />
            ))}
          </div>
          <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {SCORE_PARTS.map((p) => (
              <div key={p.id} className="px-4 py-4">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span aria-hidden className={`size-2.5 ${p.color}`} />
                    {p.name}
                  </span>
                  <span className="font-display text-2xl tabular-nums">{p.weight}%</span>
                </p>
                <p className="mt-1 text-sm text-text">{p.question}</p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{p.signals}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-px border border-border bg-border sm:grid-cols-3">
          {SCORE_LEVELS.map((l) => (
            <div key={l.range} className="bg-surface px-4 py-3">
              <p className="flex items-baseline gap-2">
                <span className="font-display text-xl tabular-nums">{l.range}</span>
                <span className="text-sm font-medium">{l.label}</span>
              </p>
              <p className="mt-0.5 text-xs text-text-muted">{l.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-text-dim">
          In de lijst zie je dit terug als drie balkjes onder de score: M
          (momentum), F (fit) en B (boekbaarheid).
        </p>
      </section>

      <section>
        <SectionTitle eyebrow="Badges" title="Wat de labels betekenen" />
        <p className="mb-4 max-w-2xl text-sm text-text-muted">
          Badges zijn ook filters. Op de artiestenlijst kies je bij “+ Filter”
          per badge <strong className="text-text">Wel</strong> of{" "}
          <strong className="text-text">Niet</strong>, bijvoorbeeld wel
          Momentum maar niet Agency.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {BADGE_GROUPS.map((g) => (
            <div key={g} className="border border-border bg-surface">
              <p className="border-b border-border px-4 py-2 text-[10px] tracking-[0.14em] text-text-dim uppercase">
                {RADAR_BADGE_GROUP_NL[g]}
              </p>
              <ul className="divide-y divide-border">
                {RADAR_BADGES.filter((b) => b.group === g).map((b) => (
                  <li key={b.id} className="grid grid-cols-[8.5rem_1fr] items-start gap-3 px-4 py-2.5">
                    <span>
                      <RadarBadge id={b.id} />
                    </span>
                    <span className="text-xs leading-relaxed text-text-muted">{b.hint}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Alerts" title="Wat elke melding betekent" />
        <ul className="divide-y divide-border border border-border bg-surface">
          {RADAR_ALERT_DEFS.map((d) => (
            <li
              key={d.kind}
              className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr_1fr] sm:gap-4"
            >
              <span>
                <RadarBadgePill tone={d.tone}>{d.label}</RadarBadgePill>
              </span>
              <span className="text-sm text-text">{d.meaning}</span>
              <span className="text-xs leading-relaxed text-text-muted">
                <span className="text-text-dim">Actie: </span>
                {d.action}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle eyebrow="Waar vind je wat" title="De pagina’s" />
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group bg-surface px-4 py-4 hover:bg-bg"
            >
              <p className="font-medium group-hover:underline">{p.title} →</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{p.use}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Details" title="Per signaal, voor wie het precies wil weten" />
        <div className="grid gap-3 md:grid-cols-2">
          {RADAR_SCORE_TOPICS.map((t) => (
            <details
              key={t.id}
              id={t.id}
              className="group scroll-mt-24 border border-border bg-surface target:border-text"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block font-medium">{t.title}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{t.short}</span>
                </span>
                <span aria-hidden className="text-text-dim group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-text-muted">
                {t.body}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-medium tracking-[0.14em] text-text-dim uppercase">
        {eyebrow}
      </p>
      <h2 className="font-display text-2xl tracking-[0.03em]">{title}</h2>
    </div>
  );
}
