/**
 * Tone-of-voice + mailvarianten voor B2B outreach.
 * Basis: voorbeeldmail van Reijner — persoonlijk, niet salesy.
 */

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

/** Plain-text signature appended to every outreach mail. */
export const OUTREACH_SIGNATURE = `Reijner
Thuishaven
Festival locatie voor zakelijke events
evenement@thuishaven.nl · +31 6 83 63 37 25
Contactweg 68, 1014 BW Amsterdam
thuishavenb2b.nl`;

export function appendOutreachSignature(body: string): string {
  const trimmed = body.trim().replace(/\n*(Groet|Groeten|Met vriendelijke groet|Cheers)[,!]?\s*\n*Thuishaven Events\s*$/i, "");
  if (/^Reijner\s*$/m.test(trimmed) && /Festival locatie voor zakelijke events/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}\n\n${OUTREACH_SIGNATURE}`;
}

export type OutreachVariantId =
  | "warm_tour"
  | "open_dates"
  | "jubileum"
  | "short_checkin";

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
    name: "Warm · bezichtiging",
    audience: "both",
    description: "Persoonlijk, dicht bij Reijners stijl — soft uitnodiging voor een rondleiding.",
    guidance:
      "Schrijf alsof Reijner zelf mailt. Warm en rustig. Max 2–3 area's met karakter. Geen sales-taal, geen 'unieke kans', geen druk. Soft: zin om even langs te komen.",
    subjects: {
      a: "Even kennismaken op Thuishaven?",
      b: "Thuishaven als locatie — zin in een rondleiding?",
    },
  },
  {
    id: "open_dates",
    name: "Open data · bureau",
    audience: "agency",
    description: "Korte, behulpzame update voor eventbureaus.",
    guidance:
      "Alsof je een bekende belt: kort, behulpzaam, geen pitch. Deel open data + link. Bied floorplans alleen aan als ze willen. Geen jubileum-taal.",
    subjects: {
      a: "Open data bij Thuishaven",
      b: "Even doorgeven — doordeweekse slots",
    },
  },
  {
    id: "jubileum",
    name: "Jubileum · bedrijf",
    audience: "company",
    description: "Oprechte felicitatie, geen hard pitch.",
    guidance:
      "Gefeliciteerd kort en oprecht. Geen clichés. Soft vraag of ze ergens over nadenken voor een avond. Nodig uit voor een bezichtiging zonder druk.",
    subjects: {
      a: "Gefeliciteerd — en een klein idee",
      b: "Jullie jubileum · Thuishaven",
    },
  },
  {
    id: "short_checkin",
    name: "Korte check-in",
    audience: "both",
    description: "3–5 zinnen, persoonlijk, geen verkooppraatje.",
    guidance:
      "Max 4 zinnen. Geen area-opsomming. Gewoon vragen of er iets speelt en of een korte rondleiding zinvol is.",
    subjects: {
      a: "Korte vraag",
      b: "Even checken",
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
  return `Je schrijft outbound e-mails namens Reijner van Thuishaven (Amsterdam).

Tone of voice (verplicht):
- Persoonlijk en rustig — alsof Reijner zelf typt
- Geen salesy taal, geen hype, geen emoji's, geen "unieke kans"
- Soft CTA: bezichtiging / rondleiding
- Commercieel model alleen als het past: huur per area + cateringpakket
- Areas met karakter (max 2–3): Mainstage, Circustent, Romneyloods, Barhuisje, Café, Tempel

Voorbeeldmail (stijlanker):
---
${REIJNER_TONE_EXAMPLE}
---

Outputregels:
- Antwoord ALLEEN met JSON: {"subject":"...","body":"..."}
- Body in plain text (geen HTML), Nederlandse spreektaal
- Onderwerp max ~60 tekens
- Eindig de body met een korte groet ("Groet," of "Spreek je snel,") — ZONDER handtekening; die wordt apart toegevoegd
- Geen placeholders zoals [naam]`;
}
