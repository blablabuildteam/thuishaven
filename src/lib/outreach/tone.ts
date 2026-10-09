/**
 * Tone-of-voice + mailvarianten voor B2B outreach.
 * Basis: voorbeeldmail van Reijner — persoonlijk, niet salesy.
 */

import {
  applySenderSignature,
  getSenderProfile,
  DEFAULT_SENDER_PROFILE_ID,
} from "@/lib/outreach/sender-profiles";

export {
  applySenderSignature,
  getSenderProfile,
  DEFAULT_SENDER_PROFILE_ID,
} from "@/lib/outreach/sender-profiles";

export const REIJNER_TONE_EXAMPLE = `Hi,

Tof dat je aan Thuishaven denkt als mogelijke locatie voor jullie evenement!

Thuishaven is een festivalterrein met daarop verschillende in- en outdoor area's, elk met een eigen karakter:
de outdoor Mainstage met imposante, roestige damwand
een kleurrijke, vintage Circustent
een ruime, robuuste Romneyloods
een snoezig Barhuisje
het buitenzinnige Thuishaven Café
en in de winter herrijst de Tempel als extra verwarmde zaal
Onze voorstellen voor de verhuur zijn simpel en overzichtelijk. Bij ons betaald een partij huur voor de area's die ingezet worden en neemt men daarbij een cateringpakket af.

Graag plan ik met jou een bezichtiging in om de mogelijkheden samen op locatie te bespreken.

Mocht je vragen hebben dan hoor ik het graag!`;

/** Plain-text signature appended to every outreach mail (default: Reijner). */
export const OUTREACH_SIGNATURE = getSenderProfile(DEFAULT_SENDER_PROFILE_ID)
  .signature;

export function appendOutreachSignature(body: string): string {
  return applySenderSignature(
    body,
    getSenderProfile(DEFAULT_SENDER_PROFILE_ID),
  );
}

export type OutreachVariantId =
  | "warm_tour"
  | "open_dates"
  | "jubileum"
  | "seizoen"
  | "zomer"
  | "kerst"
  | "nieuwjaar"
  | "funding"
  | "recordjaar"
  | "short_checkin"
  | "brochure";

export type OutreachSubjectArm = "a" | "b";

export type OutreachVariant = {
  id: OutreachVariantId;
  name: string;
  audience: "company" | "agency" | "both";
  description: string;
  guidance: string;
  subjects: Record<OutreachSubjectArm, string>;
};

export const OUTREACH_VARIANTS: OutreachVariant[] = [
  {
    id: "warm_tour",
    name: "Algemeen feest",
    audience: "both",
    description: "Koude acquisitie AMS-West — ToV: bijna buren, nieuwsgierigheid wekken.",
    guidance:
      "Persoonlijk, enthousiast, eigenzinnig, gastvrij. Kort. Geen harde pitch. Geen clichés als uniek/exclusief. Soft vraag of er een event speelt.",
    subjects: {
      a: "Een event bij Thuishaven?",
      b: "Thuishaven als locatie — zin in een rondleiding?",
    },
  },
  {
    id: "open_dates",
    name: "Open data · bureau",
    audience: "agency",
    description: "Korte, behulpzame update voor eventbureaus.",
    guidance:
      "Alsof je een bekende belt: kort, behulpzaam, geen pitch. Deel open data + brochure-link. Geen jubileum-taal.",
    subjects: {
      a: "Open data bij Thuishaven",
      b: "Even doorgeven — doordeweekse slots",
    },
  },
  {
    id: "jubileum",
    name: "Jubileum",
    audience: "company",
    description: "Jubileum groots vieren — ToV-voorbeeld.",
    guidance:
      "Persoonlijk, enthousiast, niet corporate. Jubileum groots. Soft meedenken. Geen clichés als uniek/exclusief.",
    subjects: {
      a: "Een jubileum vraagt om een plek als Thuishaven",
      b: "Jullie jubileum · Thuishaven",
    },
  },
  {
    id: "seizoen",
    name: "Seizoensfeest (auto)",
    audience: "company",
    description: "Generieke seizoensmail — liever Zomer / Kerst / Nieuwjaar kiezen.",
    guidance:
      "ToV: enthousiast, kort. Soft meedenken. Liever specifieke seizoens-template gebruiken.",
    subjects: {
      a: "Tijd voor een seizoensfeest?",
      b: "Idee voor jullie teamfeest",
    },
  },
  {
    id: "zomer",
    name: "Zomerfeest",
    audience: "company",
    description: "ToV-voorbeeld: zomerfeest / bedrijfsfestival.",
    guidance:
      "Persoonlijk, enthousiast. Zomerfeest-agenda. Soft meedenken. Geen clichés.",
    subjects: {
      a: "Tijd voor een zomerfeest?",
      b: "Jullie zomerfeest op Thuishaven?",
    },
  },
  {
    id: "kerst",
    name: "Kerstborrel",
    audience: "company",
    description: "ToV-voorbeeld: kerstborrel / einde-jaar.",
    guidance:
      "Persoonlijk, enthousiast. Kerstborrel. Soft meedenken. Geen clichés.",
    subjects: {
      a: "Jullie kerstborrel op Thuishaven?",
      b: "Einde-jaar op locatie?",
    },
  },
  {
    id: "nieuwjaar",
    name: "Nieuwjaarsborrel",
    audience: "company",
    description: "ToV-voorbeeld: nieuwjaarsborrel.",
    guidance:
      "Persoonlijk, enthousiast. Nieuwjaarsborrel. Soft meedenken.",
    subjects: {
      a: "Het nieuwe jaar goed beginnen op Thuishaven",
      b: "Nieuwjaarsborrel · Thuishaven",
    },
  },
  {
    id: "funding",
    name: "Deal / funding",
    audience: "company",
    description: "IPO, funding round of overname vieren.",
    guidance:
      "Soft: als jullie iets te vieren hebben. Warm, kort. Geen finance-jargon.",
    subjects: {
      a: "Iets te vieren na een deal?",
      b: "Funding / mijlpaal · Thuishaven",
    },
  },
  {
    id: "recordjaar",
    name: "Recordjaar",
    audience: "company",
    description: "Targets gehaald — kick-off of afterparty.",
    guidance:
      "Soft vraag naar kick-off, afterparty of teamfeest. Nederlands, enthousiast, geen hype.",
    subjects: {
      a: "Targets gehaald — teamavond?",
      b: "Kick-off of afterparty op Thuishaven?",
    },
  },
  {
    id: "short_checkin",
    name: "Korte check-in",
    audience: "both",
    description: "3–5 zinnen, persoonlijk, geen verkooppraatje.",
    guidance:
      "Max 4 zinnen. Soft vraag of er iets speelt. Brochure-link ok.",
    subjects: {
      a: "Korte vraag",
      b: "Even checken",
    },
  },
  {
    id: "brochure",
    name: "Brochure (link)",
    audience: "company",
    description:
      "Korte mail met link naar de PDF-brochure — geen bijlage.",
    guidance:
      "Kort. Verwijs naar brochure-URL. Soft vraag of er een feest speelt.",
    subjects: {
      a: "Onze brochure — Thuishaven",
      b: "Even de brochure meesturen",
    },
  },
];

export function getOutreachVariant(id: OutreachVariantId): OutreachVariant {
  return (
    OUTREACH_VARIANTS.find((v) => v.id === id) ?? OUTREACH_VARIANTS[0]!
  );
}

export function pickSubjectArm(seed?: string): OutreachSubjectArm {
  if (!seed) return Math.random() < 0.5 ? "a" : "b";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 2;
  return h === 0 ? "a" : "b";
}

export function buildOutreachSystemPrompt(): string {
  return `Je schrijft outbound e-mails namens Thuishaven (Amsterdam-West) — toon alsof Reijner of Yoram zelf typt.

Tone of voice (verplicht):
- Persoonlijk, rustig, licht nieuwsgierig — geen pitch
- Geen salesy taal, geen hype, geen emoji's, geen "unieke kans" / "exclusief"
- Soft CTA: langskomen / rondleiding / even kijken of het past
- Commercieel model alleen als het écht past: huur per area + cateringpakket
- Areas met karakter (max 1–2, niet opsommen): Mainstage, Circustent, Romneyloods, Barhuisje, Café, Tempel

Altijd een persoonlijke AI-mail (verplicht):
- Elke mail is uniek voor dit ene bedrijf — andere opening, andere tweede zin, andere wending
- De gekozen invalshoek/label (jubileum, seizoen, funding, …) is de haak: houd die aan
- Verwerk die haak natuurlijk — niet forceren als een feit ontbreekt, maar wel in die richting schrijven
- Gebruik concrete feiten uit de prompt (sector, plaats, grootte) als die er zijn — nooit een jubileum-aantal jaren (KvK-datum is onbetrouwbaar)
- Een template-body in de prompt is alleen referentie: herschrijf volledig, kopieer geen zinnen
- Nooit een mail die 1-op-1 naar een ander bedrijf gekopieerd had kunnen worden
- Varieer openings: soms "Hi," soms met voornaam, soms een korte observatie
- Kort houden: ~80–140 woorden body

Voorbeeldmail (stijlanker, NIET naschrijven):
---
${REIJNER_TONE_EXAMPLE}
---

Outputregels:
- Antwoord ALLEEN met JSON: {"subject":"...","body":"..."}
- Body in plain text (geen HTML), Nederlandse spreektaal
- Subject: gebruik exact het subject uit de user-prompt (niet herschrijven)
- Eindig de body met een korte groet ("Groet," of "Spreek je snel,") — ZONDER handtekening; die wordt apart toegevoegd
- Geen placeholders zoals [naam]`;
}
