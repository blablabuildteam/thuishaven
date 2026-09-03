/**
 * Prospectbronnen naast / naast KvK — multi-source discovery.
 * Elke bron levert kandidaten; we dedupliceren op KvK-nummer, domein of bedrijfsnaam.
 */

export type ProspectSourceId =
  | "kvk"
  | "bureau_import"
  | "website_scrape"
  | "google_places"
  | "companies_house_style"
  | "enrichment_api"
  | "chamber_open_data"
  | "event_industry_dirs"
  | "linkedin_sales_nav"
  | "existing_crm";

export type ProspectSource = {
  id: ProspectSourceId;
  name: string;
  description: string;
  whatYouGet: string[];
  legalNote: string;
  effort: "laag" | "middel" | "hoog";
  cost: "gratis" | "laag" | "middel" | "hoog";
  status: "ingebouwd" | "gepland" | "onderzoek";
  envKeys?: string[];
  meetingQuestions: string[];
};

export const PROSPECT_SOURCES: ProspectSource[] = [
  {
    id: "kvk",
    name: "KvK Handelsregister API",
    description:
      "Officiële bron voor NL-bedrijven: oprichtingsdatum (jubilea), vestigingsplaats, SBI, soms medewerkersklasse.",
    whatYouGet: [
      "Bedrijfsnaam + KvK-nummer",
      "Vestigingsadres / plaats",
      "Oprichtingsdatum → jubileum-trigger",
      "Rechtsvorm / SBI-sector",
    ],
    legalNote: "B2B; geen onnodige persoonsgegevens opslaan. Opt-out in elke mail.",
    effort: "middel",
    cost: "middel",
    status: "gepland",
    envKeys: ["KVK_API_KEY"],
    meetingQuestions: [
      "Wij richten de KvK API in — kunnen we dat onder jullie KvK/Developer-account doen zodat credits bij jullie landen?",
      "Wie nodigt ons uit / deelt toegang tot dat account?",
      "Akkoord targeting 500–5.000 medewerkers, Amsterdam + 50 km?",
    ],
  },
  {
    id: "bureau_import",
    name: "Eventbureau-import (CSV / sheet)",
    description:
      "Jullie partnerlijst is vaak beter dan open data. Import → vaste open-data campagne.",
    whatYouGet: ["Naam", "Contact-e-mail", "Relatie / notities"],
    legalNote: "Bestaande zakelijke contacten; respecteer eerdere afspraken / no-go’s.",
    effort: "laag",
    cost: "gratis",
    status: "ingebouwd",
    meetingQuestions: [
      "Kunnen jullie een sheet leveren met bureau + e-mail + contactpersoon-rol?",
      "Welke bureaus mogen we wél / niet mailen?",
    ],
  },
  {
    id: "website_scrape",
    name: "Website / contactpagina extractie",
    description:
      "Gegeven een domein: haal info@, events@, hello@ en eventueel telefoon van contactpagina’s.",
    whatYouGet: ["E-mailkandidaten", "Domein bevestigd", "Soms team-/about-signalen"],
    legalNote: "Alleen publieke zakelijke adressen; rate-limits + robots respecteren.",
    effort: "middel",
    cost: "gratis",
    status: "gepland",
    meetingQuestions: [
      "Akkoord dat we publieke contactmails van bedrijfswebsites ophalen?",
    ],
  },
  {
    id: "google_places",
    name: "Google Places / Maps",
    description:
      "Bedrijven op locatie/categorie in Amsterdam-regio (kantoren, HQ’s). Goed voor aanvulling, minder voor jubilea.",
    whatYouGet: ["Naam", "Adres", "Website", "Telefoon", "Soms openingstijden"],
    legalNote: "Google ToS + billing; geen massale scraping van Maps UI.",
    effort: "middel",
    cost: "laag",
    status: "onderzoek",
    envKeys: ["GOOGLE_PLACES_API_KEY"],
    meetingQuestions: [
      "Mogen we Google Places gebruiken als aanvullende locatiebron?",
    ],
  },
  {
    id: "enrichment_api",
    name: "Enrichment partner (Apollo / Clearbit / Hunter / etc.)",
    description:
      "Verrijking: medewerkersaantal, sector, generic e-mail, soms decision-maker. Alternatief of aanvulling op KvK.",
    whatYouGet: [
      "Employee count estimates",
      "Industry tags",
      "Verified / patterned e-mails",
      "Technografie (optioneel)",
    ],
    legalNote: "Check AVG + leveranciersvoorwaarden; liever company-level dan persoonsdata.",
    effort: "laag",
    cost: "middel",
    status: "onderzoek",
    envKeys: ["ENRICHMENT_API_KEY"],
    meetingQuestions: [
      "Budget voor enrichment (Apollo/Hunter/Clearbit) — of liever alleen KvK + scrape?",
      "Mogen we generic company e-mails kopen/verifiëren, of alleen zelf gevonden adressen?",
    ],
  },
  {
    id: "chamber_open_data",
    name: "Open datasets / jaarverslagen",
    description:
      "CBS, open bedrijfslijsten, brancheverenigingen, FD Gazellen, Deloitte Fast50, etc. als seed-lijsten.",
    whatYouGet: ["Naamlijsten grotere werkgevers", "Sectorfilters", "Groeisignalen"],
    legalNote: "Bronvermelding; check hergebruikrechten per dataset.",
    effort: "middel",
    cost: "gratis",
    status: "onderzoek",
    meetingQuestions: [
      "Hebben jullie interne lijsten (sponsors, eerdere B2B-leads, corporate gasten)?",
    ],
  },
  {
    id: "event_industry_dirs",
    name: "Eventbranche-directories",
    description:
      "Directories van event agencies, MICE, DMC’s in NL/AMS voor de bureau-stroom.",
    whatYouGet: ["Bureau-namen", "Soms websites / mails"],
    legalNote: "Alleen publieke listings; geen login-walled scrapes zonder toestemming.",
    effort: "middel",
    cost: "laag",
    status: "onderzoek",
    meetingQuestions: [
      "Welke directories of netwerken gebruiken jullie zelf (ILEA, Buma, etc.)?",
    ],
  },
  {
    id: "linkedin_sales_nav",
    name: "LinkedIn · Event / Office / Facilities Manager",
    description:
      "Zoek decision-makers bij doelbedrijven: Event Manager, Office Manager, Facilities, People Ops, Internal Comms. Sales Nav of Apollo/Hunter voor company + rol → generic of verified mail.",
    whatYouGet: [
      "Rollen bij grote werkgevers (niet alleen CEO)",
      "Headcount band",
      "Soms direct e-mail / LinkedIn URL",
    ],
    legalNote:
      "LinkedIn ToS streng — liever Sales Nav export of enrichment-partner dan scrape. Liever company-level + rol dan massale persoonsdata.",
    effort: "middel",
    cost: "middel",
    status: "onderzoek",
    envKeys: ["LINKEDIN_ACCESS_TOKEN", "ENRICHMENT_API_KEY"],
    meetingQuestions: [
      "Hebben jullie Sales Navigator of Apollo?",
      "Akkoord om Event/Office/Facilities Managers te targeten (B2B)?",
      "Willen we persoonsnamen in de DB, of alleen company + generic events@?",
    ],
  },
  {
    id: "companies_house_style",
    name: "Grote werkgeverslijsten AMS",
    description:
      "Seed zonder KvK: Amsterdam Economic Board, I amsterdam corporate lists, FD Gazellen, Deloitte Fast50, largest employers NL — filter 500–5k + regio, daarna website-scrape voor events@.",
    whatYouGet: ["Naamlijsten HQ’s", "Sector", "Soms headcount"],
    legalNote: "Check hergebruikrechten per bron; daarna publieke contactpagina’s.",
    effort: "laag",
    cost: "gratis",
    status: "onderzoek",
    meetingQuestions: [
      "Hebben jullie al een ‘dream list’ van corporates die jullie willen?",
    ],
  },
  {
    id: "existing_crm",
    name: "Bestaande CRM / mailbox / Brevo lijsten",
    description:
      "Warmste bron: wie mailde al, wie boekte al, wie is no-go. Import als seed + exclusion.",
    whatYouGet: ["Historische leads", "Uitsluitingen", "Warmte-scores"],
    legalNote: "Interne data; perfect als exclusion + lookalike seed.",
    effort: "laag",
    cost: "gratis",
    status: "gepland",
    meetingQuestions: [
      "Kunnen we een export uit CRM / Brevo / mailbox (B2B) krijgen?",
      "Wie is ‘bestaande klant’ precies — ooit geboekt, of actief contract?",
    ],
  },
];

export type SourceCandidate = {
  source: ProspectSourceId;
  companyName: string;
  city?: string;
  website?: string;
  email?: string;
  employeeCount?: number;
  foundedYear?: number;
  confidence: number;
};

/** Mock multi-source discover — toont hoe merge/dedupe gaat werken */
export function mockMultiSourceDiscover(): {
  bySource: Record<string, number>;
  merged: SourceCandidate[];
  duplicatesRemoved: number;
} {
  const raw: SourceCandidate[] = [
    {
      source: "kvk",
      companyName: "Adyen N.V.",
      city: "Amsterdam",
      employeeCount: 4200,
      foundedYear: 2006,
      confidence: 0.95,
    },
    {
      source: "enrichment_api",
      companyName: "Adyen",
      website: "https://www.adyen.com",
      email: "events@adyen.com",
      employeeCount: 4000,
      confidence: 0.8,
    },
    {
      source: "website_scrape",
      companyName: "Adyen",
      website: "https://www.adyen.com",
      email: "events@adyen.com",
      confidence: 0.7,
    },
    {
      source: "bureau_import",
      companyName: "Fresh Cotton Events",
      city: "Amsterdam",
      email: "hello@freshcotton.nl",
      confidence: 0.99,
    },
    {
      source: "event_industry_dirs",
      companyName: "Sense Events",
      city: "Amstelveen",
      website: "https://sense-events.nl",
      confidence: 0.6,
    },
    {
      source: "google_places",
      companyName: "TomTom",
      city: "Amsterdam",
      website: "https://www.tomtom.com",
      confidence: 0.55,
    },
    {
      source: "existing_crm",
      companyName: "ING",
      email: "corporate.events@ing.com",
      confidence: 0.9,
    },
  ];

  const bySource: Record<string, number> = {};
  for (const r of raw) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }

  const merged: SourceCandidate[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;

  for (const row of raw.sort((a, b) => b.confidence - a.confidence)) {
    const key = normalizeCompanyKey(row.companyName);
    if (seen.has(key)) {
      duplicatesRemoved += 1;
      const existing = merged.find((m) => normalizeCompanyKey(m.companyName) === key);
      if (existing) {
        existing.email ??= row.email;
        existing.website ??= row.website;
        existing.employeeCount ??= row.employeeCount;
        existing.foundedYear ??= row.foundedYear;
      }
      continue;
    }
    seen.add(key);
    merged.push({ ...row });
  }

  return { bySource, merged, duplicatesRemoved };
}

function normalizeCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(n\.?v\.?|b\.?v\.?|vof|ltd|inc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
