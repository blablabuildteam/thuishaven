import type { OutreachVariantId } from "./tone";

/** Default plain-text bodies — aligned with Thuishaven B2B Tone of Voice + voorbeeldmails. */
export const DEFAULT_BODY_TEMPLATES: Record<OutreachVariantId, string> = {
  open_dates: `Hi {{contactFirstName}},

Hopelijk alles goed bij {{companyName}}. Even kort doorgeven: we hebben weer een paar doordeweekse data openstaan.

{{availabilityUrl}}

Brochure met areas en sfeer: {{brochureUrl}}

Mocht je floorplans of capacity willen, hoor ik het graag.

Spreek je snel,`,

  short_checkin: `Hi {{contactFirstName}},

Speelt er bij jullie binnenkort iets — borrel, teamdag, bedrijfsevent? Dan is het misschien leuk om even langs te komen op Thuishaven.

Brochure: {{brochureUrl}}
Live agenda: {{availabilityUrl}}

Laat maar weten of een korte rondleiding zinvol is.

Groet,`,

  jubileum: `Hi {{contactFirstName}},

Een jubileum vier je groots.

Op Thuishaven kunnen we het terrein helemaal inzetten voor jullie jubileum: ontvangst en borrel, diner, optredens, feest, of juist een combinatie daarvan.

Met verschillende indoor en outdoor area’s kunnen we de dag of avond helemaal rondom jullie programma bouwen.

Zijn jullie al bezig met de plannen voor {{companyName}}’s jubileum? Dan denk ik graag eens mee over wat er op Thuishaven mogelijk is.

Brochure: {{brochureUrl}}

Groet,`,

  seizoen: `Hi {{contactFirstName}},

{{seasonHook}}

Op Thuishaven kunnen bedrijven hun eigen festivaldag of borrel organiseren: ontvangst, food, drinks, muziek en ruimte om daarna door te feesten.

Van een informele borrel met het team tot een compleet bedrijfsfestival. We bouwen het graag rondom jullie ideeën.

Zijn jullie al aan het nadenken over iets voor {{companyName}}? Dan denk ik graag met jullie mee.

Brochure: {{brochureUrl}}

Groet,`,

  zomer: `Hi {{contactFirstName}},

Lekker vroeg, maar de zomerfeest-agenda’s beginnen alweer aardig vol te lopen.

Op Thuishaven kunnen bedrijven hun eigen festivaldag organiseren: ontvangst, food, drinks, muziek en natuurlijk ruimte om daarna flink door te feesten.

Van een informele borrel met het team tot een compleet bedrijfsfestival voor honderden gasten. We bouwen het graag rondom jullie ideeën en wensen.

Zijn jullie al aan het nadenken over het zomerfeest van {{companyName}}? Dan denk ik graag met jullie mee.

Brochure: {{brochureUrl}}

Groet,`,

  kerst: `Hi {{contactFirstName}},

De kerstborrel alweer aan het organiseren?

We hebben op Thuishaven een aantal bijzondere areas waar je met je team het jaar goed kunt afsluiten. Van een borrel in onze verwarmde vintage circustent tot een compleet feest met sit-down dinner en afterparty in onze tempel en loods.

Drankjes, eten, muziek en natuurlijk genoeg ruimte om met z’n allen het jaar uit te luiden.

Benieuwd of Thuishaven iets voor {{companyName}} kan zijn?

Brochure: {{brochureUrl}}

Groet,`,

  nieuwjaar: `Hi {{contactFirstName}},

Een nieuw jaar verdient een goede aftrap.

Op Thuishaven organiseren we nieuwjaarsborrels waar je collega’s maandag nog over praten. Verschillende area’s, goede catering, drankjes en natuurlijk alle ruimte voor muziek en feest.

Ideaal voor een nieuwjaarsborrel die nét even anders mag zijn.

Zijn jullie de nieuwjaarsborrel voor {{companyName}} al aan het plannen? Dan denk ik graag met jullie mee.

Brochure: {{brochureUrl}}

Groet,`,

  funding: `Hi {{contactFirstName}},

Als jullie bij {{companyName}} iets te vieren hebben na een deal, funding of overname: soms zoeken teams daar een avondlocatie voor.

Thuishaven in Amsterdam-West is doordeweeks beschikbaar — geen pitch, gewoon kijken of de sfeer past.

Brochure: {{brochureUrl}}

Zin om even langs te komen?

Groet,`,

  recordjaar: `Hi {{contactFirstName}},

Als jullie bij {{companyName}} een sterk jaar of targets vieren — kick-off, afterparty, teamavond — dan is Thuishaven misschien een idee.

Doordeweeks zijn we vaak beschikbaar. Een korte rondleiding zegt meestal genoeg.

Brochure: {{brochureUrl}}

Laat maar weten of dat speelt.

Groet,`,

  brochure: `Hi {{contactFirstName}},

Ik stuur je graag even onze brochure mee — zo zie je in één oogopslag wat Thuishaven is (areas, sfeer, capaciteit):

{{brochureUrl}}

Speelt er bij {{companyName}} ergens een bedrijfsfeest, teamavond of borrel? Dan denk ik graag mee.

Groet,`,

  warm_tour: `Hi {{contactFirstName}},

Ik zag dat wij bijna buren zijn en dacht: misschien is Thuishaven wel een leuke plek voor jullie volgende bedrijfsfeest.

We organiseren op ons festivalterrein in Amsterdam-West borrels, zomerfeesten, jubileums, personeelsfeesten, productlanceringen en complete bedrijfsfestivals.

Met verschillende indoor en outdoor area’s kunnen we de locatie aanpassen aan de grootte en sfeer van jullie event. Van een informele borrel tot een avond waarbij het dak eraf gaat.

Hebben jullie toevallig al een event op de agenda waarvoor jullie een locatie zoeken?

Brochure: {{brochureUrl}}

Groet,`,
};

/** Public path under /public — absolute URL for mails. */
export const BROCHURE_PUBLIC_PATH = "/brochure/thuishaven-b2b-2026.pdf";

export function getAppBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim() ||
    process.env.AUTH_URL?.replace(/\/$/, "").trim();
  // tools.thuishaven.nl wijst nog niet naar Vercel — vermijd 404 in mails.
  if (fromEnv && !fromEnv.includes("tools.thuishaven.nl")) return fromEnv;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "https://thuishaven.vercel.app";
}

export function getBrochureUrl(): string {
  return (
    process.env.OUTREACH_BROCHURE_URL?.trim() ||
    `${getAppBaseUrl()}${BROCHURE_PUBLIC_PATH}`
  );
}

export function seasonHookLine(at: Date = new Date()): string {
  const month = at.getUTCMonth() + 1;
  if (month >= 4 && month <= 9) {
    return "Lekker vroeg, maar de zomerfeest-agenda’s beginnen alweer aardig vol te lopen.";
  }
  if (month >= 10 || month <= 1) {
    return "De kerstborrel of einde-jaar alweer aan het organiseren?";
  }
  return "Het nieuwe jaar verdient een goede aftrap — of plannen jullie alvast een seizoensfeest?";
}

export function fillBodyTemplate(
  template: string,
  vars: {
    companyName: string;
    availabilityUrl: string;
    brochureUrl?: string;
    contactFirstName?: string;
    seasonHook?: string;
  },
): string {
  if (!template) {
    throw new Error("fillBodyTemplate: lege template-string");
  }
  const brochure = vars.brochureUrl ?? getBrochureUrl();
  const first =
    vars.contactFirstName?.trim() ||
    "hoi";
  const season = vars.seasonHook ?? seasonHookLine();
  return template
    .replaceAll("{{companyName}}", vars.companyName)
    .replaceAll("{{availabilityUrl}}", vars.availabilityUrl)
    .replaceAll("{{brochureUrl}}", brochure)
    .replaceAll("{{contactFirstName}}", first === "hoi" ? "hoi" : first)
    .replaceAll("{{seasonHook}}", season)
    .replace(/^Hi hoi,/m, "Hi,");
}
