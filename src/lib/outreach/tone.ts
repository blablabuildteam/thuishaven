/**
 * Tone-of-voice + mailvarianten voor B2B outreach.
 * Basis: voorbeeldmail van Reijner (Thuishaven Events).
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
  /** A/B onderwerpregels — stats worden hierop gegroepeerd */
  subjects: Record<OutreachSubjectArm, string>;
};

export const OUTREACH_VARIANTS: OutreachVariant[] = [
  {
    id: "warm_tour",
    name: "Warm · bezichtiging",
    audience: "both",
    description: "Dicht bij Reijners stijl: warm, locatie als beleving, soft CTA tour.",
    guidance:
      "Open warm. Schets 2–3 areas met karakter (niet de hele lijst). Noem huur + cateringpakket kort. Soft CTA: bezichtiging plannen. Geen hard sales-push.",
    subjects: {
      a: "Bezichtiging Thuishaven — even kennismaken op locatie?",
      b: "Thuishaven voor jullie volgende bedrijfsevent",
    },
  },
  {
    id: "open_dates",
    name: "Open data · bureau",
    audience: "agency",
    description: "Update voor eventbureaus met link naar live beschikbaarheid.",
    guidance:
      "Kort en praktisch voor bureaus. Focus op open doordeweekse slots + live agenda-link. Bied floorplans/capacity aan. Geen jubileum-taal.",
    subjects: {
      a: "Open data Thuishaven — handig voor je pitches",
      b: "Actuele doordeweekse slots bij Thuishaven",
    },
  },
  {
    id: "jubileum",
    name: "Jubileum · bedrijf",
    audience: "company",
    description: "Proactief voor 5/10/25-jarig jubileum, nog steeds warm (niet pushy).",
    guidance:
      "Gefeliciteerd kort en oprecht. Koppel jubileum aan een avond die bij hun cultuur past. Soft CTA tour + beschikbaarheid. Geen 'meer dan een taart op kantoor'-clichés.",
    subjects: {
      a: "Gefeliciteerd — een avond die bij jullie past",
      b: "Jubileum vieren op Thuishaven?",
    },
  },
  {
    id: "short_checkin",
    name: "Korte check-in",
    audience: "both",
    description: "3–5 zinnen, minimale locatiepitch, sterke soft CTA.",
    guidance:
      "Maximaal 5 zinnen. Geen area-opsomming. Vraag of er een bedrijfsevent speelt en bied bezichtiging + agenda-link.",
    subjects: {
      a: "Korte vraag over jullie volgende event",
      b: "Even checken — speelt er iets bij jullie?",
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
  return `Je schrijft outbound e-mails voor Thuishaven (Amsterdam), een festivalterrein voor bedrijfsevents.

Tone of voice (verplicht):
- Warm, persoonlijk, toegankelijk — zoals de voorbeeldmail van het Thuishaven Events-team
- Geen corporate jargon, geen hype, geen emoji's
- Soft CTA: bezichtiging / tour, nooit hard pushen
- Commercieel model: huur per area + cateringpakket
- Areas met karakter: Mainstage (outdoor/damwand), Circustent, Romneyloods, Barhuisje, Thuishaven Café, Tempel (winter)

Voorbeeldmail (stijlanker):
---
${REIJNER_TONE_EXAMPLE}
---

Outputregels:
- Antwoord ALLEEN met JSON: {"subject":"...","body":"..."}
- Body in plain text (geen HTML), Nederlandse spreektaal
- Onderwerp max ~60 tekens, geen ALL CAPS
- Gebruik de voornaam/bedrijfsnaam natuurlijk
- Als availabilityUrl gegeven is: zet die als aparte regel in de body
- Eindig met een korte groet (Thuishaven Events of alleen voornaam als die gegeven is)
- Geen placeholders zoals [naam]`;
}
