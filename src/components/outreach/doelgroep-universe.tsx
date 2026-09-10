import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { DOELGROEP } from "@/lib/outreach/doelgroep";
import {
  UNIVERSE,
  UNIVERSE_LEVERS,
  UNIVERSE_NOTE,
  estimateCurrentUniverseCosts,
} from "@/lib/outreach/universe";

type Props = {
  compact?: boolean;
  listedCount?: number;
};

export function DoelgroepUniverse({ compact = false, listedCount }: Props) {
  const costs = estimateCurrentUniverseCosts();

  if (compact) {
    return (
      <div className="mb-8 border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-dim">
              Geschatte doelgroep
            </p>
            <p className="mt-1 font-display text-2xl tracking-[0.06em]">
              {UNIVERSE.fitLow}–{UNIVERSE.fitHigh} bedrijven
            </p>
            <p className="mt-1 max-w-xl text-sm text-text-muted">
              {DOELGROEP.minEmployees}–{DOELGROEP.maxEmployees} mdw ·{" "}
              {DOELGROEP.regionLabel}. We halen iedereen op. “150–300 met
              adres” is alleen wie op dag 1 al een mail heeft — de rest komt
              later. Hele lijst ophalen: {costs.labels.fetch100}.
            </p>
          </div>
          <Link
            href="/outreach/kosten"
            className="border border-border bg-bg px-3 py-2 font-display text-sm tracking-[0.1em] hover:border-accent"
          >
            Kostmeter →
          </Link>
        </div>
        {typeof listedCount === "number" ? (
          <p className="mt-3 text-xs text-text-dim">
            Nu in de tool: {listedCount} · nog ongeveer{" "}
            {Math.max(0, UNIVERSE.fitLow - listedCount)}–
            {Math.max(0, UNIVERSE.fitHigh - listedCount)} te gaan om ze allemaal
            binnen te hebben.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="mb-8 border border-accent/40 bg-surface p-4">
      <h2 className="font-display text-2xl tracking-[0.06em]">
        Hele doelgroep · schatting
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-text-muted">
        {DOELGROEP.minEmployees}–{DOELGROEP.maxEmployees} medewerkers ·{" "}
        {DOELGROEP.regionLabel} · {DOELGROEP.trigger}. {UNIVERSE_NOTE}
      </p>

      <div className="stagger mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Echte fit"
          value={`${UNIVERSE.fitLow}–${UNIVERSE.fitHigh}`}
          hint={`midden ~${UNIVERSE.fitMid}`}
          accent
        />
        <MetricCard
          label="Op dag 1 een adres"
          value={`${UNIVERSE.mailableLow}–${UNIVERSE.mailableHigh}`}
          hint="de rest staat wél op de lijst, mail volgt later"
        />
        <MetricCard
          label="Hele lijst slim"
          value={costs.labels.slim100}
          hint={`KvK ${costs.labels.kvk} · ophalen ${costs.labels.fetch100} bij 100/pagina`}
        />
        <MetricCard
          label="Hele lijst volle rits"
          value={costs.labels.full}
          hint="iedereen KvK + Hunter-helft + personen"
        />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="border border-border bg-bg p-4 text-sm text-text-muted">
          <p className="font-medium text-text">Om ze allemaal te ontvangen</p>
          <p className="mt-2">
            Apollo leegtrekken tot hun totaal (100 per credit). Daarna de
            gaten: Event/Office Managers in de regio, startlijst, en namen die
            Reijner al kent. Hunter en personen pas als je écht gaat mailen.
          </p>
          <p className="mt-2 text-xs text-text-dim">
            Alleen jubileum dit jaar: {UNIVERSE.jubileeThisYear.low}–
            {UNIVERSE.jubileeThisYear.high} bedrijven. Intern event is bijna
            iedereen in de fit-band.
          </p>
        </div>
        <div className="border border-border bg-bg p-4 text-sm text-text-muted">
          <p className="font-medium text-text">Om ze goed te krijgen</p>
          <p className="mt-2">
            Concern-dedupe (niet 3× dezelfde holding). Site-mail eerst. KvK voor
            jubileum en non-mailing. Contactpersoon alleen op dossiers die je
            personaliseert. Overheid/onderwijs apart zetten als die niet
            converteren.
          </p>
          <p className="mt-2 text-xs text-text-dim">
            Slim pad voor ~{costs.companies} namen: {costs.labels.slim100}.
            Zelfde lijst vol verrijken: {costs.labels.full}.
          </p>
        </div>
      </div>

      <h3 className="mt-6 font-display text-xl tracking-[0.06em]">
        Meer volume, zonder de lijst te vervuilen
      </h3>
      <p className="mt-2 text-sm text-text-muted">
        Radius verbreden is één knop. Dit levert meestal meer op, of maakt de
        bestaande lijst beter.
      </p>
      <ul className="mt-4 divide-y divide-border border-t border-border">
        {UNIVERSE_LEVERS.map((row) => (
          <li key={row.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-text">{row.label}</p>
              <p className="font-display text-sm tracking-wide text-accent">
                {row.extra}
              </p>
            </div>
            <p className="mt-1 text-xs text-text-muted">{row.cost}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge tone="success">kwaliteit · {row.quality}</StatusBadge>
              <StatusBadge tone="info">
                compleet · {row.completeness}
              </StatusBadge>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
