import type { OutreachVariantId } from "./tone";

/** Default plain-text bodies. Placeholders: {{companyName}} {{availabilityUrl}} {{brochureUrl}} */
export const DEFAULT_BODY_TEMPLATES: Record<OutreachVariantId, string> = {
  open_dates: `Hoi,

Hopelijk alles goed bij {{companyName}}. Even kort doorgeven: we hebben weer een paar doordeweekse data openstaan.

{{availabilityUrl}}

Handig als je ergens een pitch voor maakt. Mocht je floorplans of capacity willen, hoor ik het graag.

Spreek je snel,`,

  short_checkin: `Hoi,

Speelt er bij jullie binnenkort iets — borrel, teamdag, bedrijfsevent? Dan is het misschien leuk om even langs te komen op Thuishaven.

Live agenda: {{availabilityUrl}}

Laat maar weten of een korte rondleiding zinvol is.

Groet,`,

  jubileum: `Hoi,

Gefeliciteerd met het jubileum van {{companyName}} — mooie mijlpaal.

Mocht je ergens over nadenken voor een avond met het team: Thuishaven is doordeweeks beschikbaar. Geen druk, gewoon even kijken of de sfeer past.

{{availabilityUrl}}

Zin om een keertje langs te komen?

Groet,`,

  seizoen: `Hoi,

Bij veel bedrijven speelt nu weer een zomerfeest of einde-jaar / kerstborrel. Speelt dat ook bij {{companyName}}?

Thuishaven is doordeweeks vaak beschikbaar — een korte rondleiding zegt meestal meer dan een lange mail.

{{availabilityUrl}}

Laat maar weten of dat interessant is.

Groet,`,

  funding: `Hoi,

Als jullie bij {{companyName}} iets te vieren hebben na een deal, funding of overname: soms zoeken teams daar een avondlocatie voor.

Thuishaven in Amsterdam-West is doordeweeks beschikbaar. Geen pitch — gewoon kijken of de sfeer past.

{{availabilityUrl}}

Zin om even langs te komen?

Groet,`,

  recordjaar: `Hoi,

Als jullie bij {{companyName}} een sterk jaar of targets vieren — kick-off, afterparty, teamavond — dan is Thuishaven misschien een idee.

Doordeweeks zijn we vaak beschikbaar. Een korte rondleiding zegt meestal genoeg.

{{availabilityUrl}}

Laat maar weten of dat speelt.

Groet,`,

  brochure: `Hoi,

Ik stuur je graag even onze brochure mee — zo zie je in één oogopslag wat Thuishaven is (areas, sfeer, capaciteit):

{{brochureUrl}}

Speelt er bij {{companyName}} ergens een bedrijfsfeest, teamavond of borrel? Dan plannen we graag een korte rondleiding.

Live agenda: {{availabilityUrl}}

Groet,`,

  warm_tour: `Hoi,

Ik dacht aan {{companyName}} — misschien speelt er ergens een bedrijfsevent of borrel?

Thuishaven is een festivalterrein in Amsterdam-West met een paar areas met echt karakter (Mainstage, Circustent, Loods). Doordeweeks zijn we vaak beschikbaar; een korte rondleiding zegt meestal meer dan een lange mail.

{{availabilityUrl}}

Laat maar weten of dat interessant is.

Groet,`,
};

export function getBrochureUrl(): string {
  return (
    process.env.OUTREACH_BROCHURE_URL?.trim() ||
    "https://thuishavenb2b.nl/brochure"
  );
}

export function fillBodyTemplate(
  template: string,
  vars: {
    companyName: string;
    availabilityUrl: string;
    brochureUrl?: string;
  },
): string {
  const brochure = vars.brochureUrl ?? getBrochureUrl();
  return template
    .replaceAll("{{companyName}}", vars.companyName)
    .replaceAll("{{availabilityUrl}}", vars.availabilityUrl)
    .replaceAll("{{brochureUrl}}", brochure);
}
