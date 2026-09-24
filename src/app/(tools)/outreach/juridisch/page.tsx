import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = { title: "Juridisch · Outreach" };
export const dynamic = "force-dynamic";

const ALLOWED = [
  {
    title: "B2B-mail aan rechtspersonen",
    body: "Ongevraagde commerciële e-mail aan een BV, NV, stichting of vereniging mag zonder voorafgaande toestemming, mits je een zakelijk contactadres gebruikt dat daarvoor is bekendgemaakt (bijv. events@, info@, of een bedrijfscontact op de site) en elk bericht een eenvoudige, kosteloze opt-out bevat.",
    basis: "Telecommunicatiewet art. 11.7 lid 3 sub a",
  },
  {
    title: "AVG · gerechtvaardigd belang",
    body: "Een zakelijk adres met een naam erin (voornaam.achternaam@bedrijf.nl) is een persoonsgegeven. Verwerking voor koude B2B-acquisitie steunt meestal op gerechtvaardigd belang (AVG art. 6 lid 1 sub f). Direct marketing wordt in overweging 47 AVG als mogelijk gerechtvaardigd belang genoemd — mits je een belangenafweging (LIA) kunt laten zien: belang actueel, verwerking noodzakelijk, privacybelangen niet zwaarder.",
    basis: "AVG art. 6(1)(f) · overweging 47 · AP (direct marketing)",
  },
  {
    title: "Publieke bedrijfsdata (KvK)",
    body: "Handelsregistergegevens (naam, vestiging, oprichtingsdatum, sbi) gebruiken om te bepalen of een bedrijf in de doelgroep past (regio, jubileum, size) is gangbaar. Non-mailing-registraties respecteren we: die bedrijven gaan niet de cold-mail in.",
    basis: "Handelsregisterwet · doelbinding / minimalisatie AVG",
  },
  {
    title: "Recht van bezwaar & uitsluiting",
    body: "Bezwaar tegen direct marketing is absoluut: wie “niet mailen” zegt, of op de uitsluitingslijst staat, mogen we niet opnieuw mailen. De tool houdt bestaande klanten, partners en handmatige uitsluitingen zichtbaar buiten de mail-bulk.",
    basis: "AVG art. 21 lid 2–3 · intern: Niet mailen",
  },
  {
    title: "Wat deze tool concreet doet binnen dat kader",
    body: "Mid-size bedrijven in de Amsterdam-ring selecteren → contact zoeken bij Event/Office/Facilities-rollen → korte, herkenbare mail als Thuishaven (Reijner) → opens meten. Live send staat standaard uit; eerst tests naar team@. Geen consumenten-mail, geen bulk naar privé-Gmail zonder context.",
    basis: "Productkeuze · proportionele targeting",
  },
] as const;

const FORBIDDEN = [
  {
    title: "Particulieren / consumenten zonder toestemming",
    body: "Ongevraagde e-mailreclame aan natuurlijke personen die niet in hun beroep of bedrijf handelen vereist voorafgaande toestemming (opt-in). Consumenten-spam mag niet “even snel” via deze flow.",
    basis: "Tw art. 11.7 lid 1–2",
  },
  {
    title: "Eenmanszaken / zzp zonder duidelijk zakelijk adres",
    body: "Bij eenmanszaken en zzp’ers is de Tw-uitzondering smal: alleen als het adres aantoonbaar is bekendgemaakt om zakelijk benaderd te worden. KvK-publicatie alleen is niet automatisch genoeg. Twijfel → niet mailen of eerst toestemming.",
    basis: "Tw art. 11.7 lid 3 · praktijk ACM/AP",
  },
  {
    title: "Mailen na opt-out / “niet mailen”",
    body: "Wie heeft afgemeld, of op de uitsluitingslijst / als bestaande klant staat, opnieuw mailen is niet toegestaan. Bezwaar tegen direct marketing mag je niet “wegwegen”.",
    basis: "AVG art. 21 · Tw (opt-out)",
  },
  {
    title: "Misleidende of verborgen acquisitie",
    body: "Geen valse afzender, geen verborgen marketing als “persoonlijk berichtje” zonder herkenbare organisatie, geen verplichte traps naar afmelden. Afzender, reply-to en opt-out moeten kloppen.",
    basis: "Tw · oneerlijke handelspraktijken / reclame-ethiek",
  },
  {
    title: "Scrapen in strijd met voorwaarden / excessieve data",
    body: "LinkedIn of andere platforms schenden via scraping kan contractueel verboden zijn, los van AVG. Ook: meer persoonsgegevens verzamelen dan nodig (CV’s, privé-telefoons, gevoelige data) past niet bij dataminimalisatie.",
    basis: "AVG art. 5 · leveranciers-/platformvoorwaarden",
  },
  {
    title: "Andere landen met strengere regels",
    body: "Bijv. Duitsland (UWG) en België hanteren in de praktijk vaak strengere opt-in voor e-mailreclame, ook B2B. Deze tool is gericht op Nederlandse mid-size HQ’s — niet “EU-breed spit-and-forget”.",
    basis: "Lokale wetgeving buiten NL",
  },
] as const;

const PRACTICES = [
  {
    n: "01",
    title: "Alleen rechtspersonen in de doelgroep",
    body: "Doelgroep = mid-size bedrijven (BV e.d.) rond Amsterdam, niet consumentenlijsten.",
  },
  {
    n: "02",
    title: "Zakelijke, passende rollen",
    body: "We zoeken Event / Office / Facilities — mensen die locatiekeuze doen — niet willekeurige HR of privé-adressen.",
  },
  {
    n: "03",
    title: "Opt-out & uitsluitingen",
    body: "Uitsluitingslijst, partners en “niet mailen” blokkeren verzending. Reply “stop” → status uitzetten.",
  },
  {
    n: "04",
    title: "Herkenbare afzender",
    body: "Mail namens Reijner / Thuishaven, reply naar evenement@, korte relevantere tekst (jubileum / seizoen / brochure-link).",
  },
  {
    n: "05",
    title: "Eerst test, dan live",
    body: "Live send blijft dicht tot bewust unlock. Geen stille mass-send.",
  },
] as const;

export default function OutreachJuridischPage() {
  return (
    <div className="pb-16">
      <header className="relative mb-12 overflow-hidden border-b border-border pb-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-accent/10 blur-3xl dark:bg-accent/5"
        />
        <p className="text-xs font-medium tracking-[0.18em] text-text-dim uppercase">
          Bedrijfsevent outreach · compliance
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] tracking-[0.02em] text-text sm:text-5xl">
          Waarom dit legaal kan — en wat niet mag
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-text-muted">
          Korte onderbouwing voor Reijner/Yoram (en jullie advocaat): B2B cold
          mail aan Nederlandse rechtspersonen is onder voorwaarden toegestaan.
          Dit is{" "}
          <strong className="font-medium text-text">geen juridisch advies</strong>
          ; bij twijfel altijd jullie counsel of de AP/ACM-bronnen checken.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <StatusBadge tone="info">NL · B2B</StatusBadge>
          <StatusBadge tone="neutral">Tw 11.7 + AVG</StatusBadge>
          <Link
            href="/outreach/uitsluitingen"
            className="border border-border px-3 py-1.5 text-xs tracking-[0.1em] hover:border-accent"
          >
            Niet mailen →
          </Link>
        </div>
      </header>

      <section className="mb-14">
        <p className="text-xs tracking-[0.16em] text-text-dim uppercase">
          Mag wel
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.04em]">
          Onderbouwing: wat we doen
        </h2>
        <ul className="mt-6 space-y-0 divide-y divide-border border-y border-border">
          {ALLOWED.map((item) => (
            <li key={item.title} className="py-5">
              <h3 className="font-display text-lg tracking-[0.04em] text-text">
                {item.title}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
                {item.body}
              </p>
              <p className="mt-2 text-xs text-text-dim">{item.basis}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-14">
        <p className="text-xs tracking-[0.16em] text-text-dim uppercase">
          Mag niet
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.04em]">
          Grenzen: wat we bewust vermijden
        </h2>
        <ul className="mt-6 space-y-0 divide-y divide-border border-y border-border">
          {FORBIDDEN.map((item) => (
            <li key={item.title} className="py-5">
              <h3 className="font-display text-lg tracking-[0.04em] text-text">
                {item.title}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
                {item.body}
              </p>
              <p className="mt-2 text-xs text-text-dim">{item.basis}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-14">
        <p className="text-xs tracking-[0.16em] text-text-dim uppercase">
          In de tool
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-[0.04em]">
          Hoe we het praktisch borgen
        </h2>
        <ol className="mt-6 space-y-0">
          {PRACTICES.map((step) => (
            <li key={step.n} className="flex gap-4 border-b border-border py-4">
              <span className="flex size-9 shrink-0 items-center justify-center border border-border font-display text-xs tracking-[0.08em]">
                {step.n}
              </span>
              <div>
                <h3 className="font-display text-lg tracking-[0.04em]">
                  {step.title}
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-text-muted">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border border-border bg-surface/40 px-5 py-5 dark:bg-surface">
        <h2 className="font-display text-xl tracking-[0.04em]">Bronnen</h2>
        <ul className="mt-3 space-y-2 text-sm text-text-muted">
          <li>
            <a
              href="https://wetten.overheid.nl/BWBR0009950/2025-01-01#Hoofdstuk11"
              className="text-accent underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Telecommunicatiewet · art. 11.7
            </a>{" "}
            (ongevraagde communicatie; B2B-uitzondering)
          </li>
          <li>
            <a
              href="https://www.autoriteitpersoonsgegevens.nl/themas/internet-slimme-apparaten/reclame/reclamepost"
              className="text-accent underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Autoriteit Persoonsgegevens · reclame / direct marketing
            </a>{" "}
            (gerechtvaardigd belang + absoluut bezwaar)
          </li>
          <li>
            <a
              href="https://eur-lex.europa.eu/legal-content/NL/TXT/?uri=CELEX:32016R0679"
              className="text-accent underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              AVG (Verordening 2016/679)
            </a>{" "}
            · art. 6(1)(f), art. 21, overweging 47
          </li>
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-text-dim">
          Tip voor de advocatenmap: leg één Legitimate Interest Assessment (LIA)
          vast voor deze campagne (doelgroep, data, frequentie, opt-out,
          bewaartermijn). Dat is de documentatie die bij een vraag van de AP
          het verschil maakt — niet alleen “we mailen B2B”.
        </p>
      </section>

      <p className="mt-8 text-sm text-text-muted">
        Terug naar{" "}
        <Link href="/outreach/uitleg" className="text-accent underline">
          Hoe het werkt
        </Link>{" "}
        of{" "}
        <Link href="/outreach" className="text-accent underline">
          Overzicht
        </Link>
        .
      </p>
    </div>
  );
}
