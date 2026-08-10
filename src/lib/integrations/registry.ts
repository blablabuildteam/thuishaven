export type IntegrationTool = "shared" | "dashboard" | "outreach";

export type IntegrationStatus =
  | "missing"
  | "configured"
  | "verified"
  | "error"
  | "manual";

export type IntegrationDef = {
  id: string;
  name: string;
  tool: IntegrationTool;
  description: string;
  /** Env vars required for this integration */
  envKeys: string[];
  /** Optional env vars */
  optionalEnvKeys?: string[];
  /** What to ask Thuishaven for in the meeting */
  askFromClient: string[];
  /** How we'll verify once credentials exist */
  verifyHint: string;
  docsUrl?: string;
  priority: "critical" | "high" | "medium" | "later";
};

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "database",
    name: "PostgreSQL",
    tool: "shared",
    description: "Centrale database voor edities, prospects, tickets en sync-jobs.",
    envKeys: ["DATABASE_URL"],
    askFromClient: [
      "Akkoord op managed Postgres (bijv. Supabase/Neon) of eigen hosting",
    ],
    verifyHint: "Connectie + schema push",
    priority: "critical",
  },
  {
    id: "brevo",
    name: "Brevo",
    tool: "shared",
    description:
      "E-mailverzending (outreach) + marketingcampagne-metrics (dashboard).",
    envKeys: ["BREVO_API_KEY", "BREVO_SENDER_EMAIL"],
    optionalEnvKeys: ["BREVO_SENDER_NAME"],
    askFromClient: [
      "API-key (Settings → SMTP & API)",
      "Verzenddomein + SPF/DKIM status",
      "Sender e-mailadres dat geverifieerd is",
    ],
    verifyHint: "GET /v3/account",
    docsUrl: "https://developers.brevo.com/",
    priority: "critical",
  },
  {
    id: "ai",
    name: "AI (OpenAI / Anthropic)",
    tool: "shared",
    description: "Outreach-personalisatie + dashboard AI-chat.",
    envKeys: ["OPENAI_API_KEY"],
    optionalEnvKeys: ["ANTHROPIC_API_KEY"],
    askFromClient: [
      "Voorkeur model/provider, of wij leveren key onder jullie account",
    ],
    verifyHint: "Models list / ping",
    priority: "critical",
  },
  {
    id: "weeztix",
    name: "Weeztix",
    tool: "dashboard",
    description: "Primaire ticketverkoop + voorraad.",
    envKeys: ["WEEZTIX_API_KEY"],
    optionalEnvKeys: ["WEEZTIX_API_URL"],
    askFromClient: [
      "API-key / partner credentials",
      "Event-IDs per editie",
      "Documentatie of contact tech-partner",
    ],
    verifyHint: "Events/list endpoint",
    priority: "critical",
  },
  {
    id: "resident_advisor",
    name: "Resident Advisor",
    tool: "dashboard",
    description: "Ticketverkoop & sold-out status.",
    envKeys: ["RA_API_KEY"],
    askFromClient: [
      "API-toegang of export-methode",
      "Event-IDs mapping",
    ],
    verifyHint: "Event detail / tickets",
    priority: "high",
  },
  {
    id: "appic",
    name: "Appic",
    tool: "dashboard",
    description: "Ticketverkoop via Appic.",
    envKeys: ["APPIC_API_KEY"],
    askFromClient: ["API-key", "Event/product mapping"],
    verifyHint: "Auth + events",
    priority: "high",
  },
  {
    id: "ticketswap",
    name: "TicketSwap",
    tool: "dashboard",
    description: "Secundaire markt — alerts na sold-out.",
    envKeys: ["TICKETSWAP_API_KEY"],
    askFromClient: [
      "API-toegang of monitoring-afspraak",
      "Welke events tracken",
    ],
    verifyHint: "Event listings / search",
    priority: "high",
  },
  {
    id: "internal_ticketing",
    name: "Intern ticketbeheer",
    tool: "dashboard",
    description: "Interne ticketadministratie via API.",
    envKeys: ["INTERNAL_TICKETING_API_URL", "INTERNAL_TICKETING_API_KEY"],
    askFromClient: [
      "API-URL + documentatie",
      "Auth-methode",
      "Voorbeeld responses",
    ],
    verifyHint: "Health/ping endpoint",
    priority: "high",
  },
  {
    id: "instagram",
    name: "Instagram (Meta)",
    tool: "dashboard",
    description: "Reach, engagement, posts, assets.",
    envKeys: ["META_ACCESS_TOKEN", "META_IG_BUSINESS_ID"],
    askFromClient: [
      "Meta Business / IG Business account toegang",
      "System user token of app review pad",
    ],
    verifyHint: "GET media insights",
    docsUrl: "https://developers.facebook.com/docs/instagram-api/",
    priority: "high",
  },
  {
    id: "tiktok",
    name: "TikTok",
    tool: "dashboard",
    description: "Video performance & timing.",
    envKeys: ["TIKTOK_ACCESS_TOKEN"],
    askFromClient: ["TikTok for Business / Display API toegang"],
    verifyHint: "Video list",
    priority: "medium",
  },
  {
    id: "youtube",
    name: "YouTube",
    tool: "dashboard",
    description: "Aftermovies / channel metrics.",
    envKeys: ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID"],
    askFromClient: ["Channel ID", "API-key of OAuth"],
    verifyHint: "channels.list",
    priority: "medium",
  },
  {
    id: "kvk",
    name: "KvK API",
    tool: "outreach",
    description: "Prospectidentificatie, medewerkers, oprichtingsdatum/jubilea.",
    envKeys: ["KVK_API_KEY"],
    optionalEnvKeys: ["KVK_API_URL"],
    askFromClient: [
      "KvK API abonnement / API-key",
      "Bevestiging targeting: 500–5.000 medewerkers, Amsterdam + 50 km",
    ],
    verifyHint: "Zoeknaam of basisprofiel call",
    docsUrl: "https://developers.kvk.nl/",
    priority: "critical",
  },
  {
    id: "sales_notify",
    name: "Sales notificaties",
    tool: "outreach",
    description: "E-mail bij warme leads / positieve replies.",
    envKeys: ["SALES_NOTIFY_EMAIL"],
    askFromClient: ["E-mailadres(sen) salesteam"],
    verifyHint: "Testmail via Brevo",
    priority: "high",
  },
  {
    id: "alert_notify",
    name: "Dashboard alerts",
    tool: "dashboard",
    description: "TicketSwap / sync failure notificaties.",
    envKeys: ["ALERT_NOTIFY_EMAIL"],
    askFromClient: ["E-mailadressen marketing/management"],
    verifyHint: "Testmail via Brevo",
    priority: "medium",
  },
  {
    id: "linkedin",
    name: "LinkedIn enrichment",
    tool: "outreach",
    description:
      "Bedrijfscontext / beslissers — officieel API of enrichment partner.",
    envKeys: ["LINKEDIN_ACCESS_TOKEN"],
    optionalEnvKeys: ["ENRICHMENT_API_KEY"],
    askFromClient: [
      "Voorkeur: LinkedIn Marketing/API vs. partner (Apollo/Clearbit/etc.)",
      "Budget/akkoord voor enrichment",
    ],
    verifyHint: "Afhankelijk van gekozen pad",
    priority: "later",
  },
];

export type MeetingInput = {
  id: string;
  tool: IntegrationTool | "both";
  title: string;
  detail: string;
  ownerHint: string;
};

/** Non-credential inputs to collect in the Thuishaven meeting */
export const MEETING_INPUTS: MeetingInput[] = [
  {
    id: "edition-mapping",
    tool: "dashboard",
    title: "Editie-mapping",
    detail:
      "Lijst van edities/evenementen en hoe ze heten in Weeztix, RA, Appic, TicketSwap en intern.",
    ownerHint: "Marketing / ticketing",
  },
  {
    id: "agency-list",
    tool: "outreach",
    title: "Event bureau-lijst",
    detail: "Partners met naam + contact-e-mail voor de open-data campagne.",
    ownerHint: "Sales / partnerships",
  },
  {
    id: "exclusions",
    tool: "outreach",
    title: "Uitsluitingslijst",
    detail: "Bestaande klanten, no-go’s, eerdere contacten.",
    ownerHint: "Sales",
  },
  {
    id: "tone",
    tool: "outreach",
    title: "Tone of voice voorbeelden",
    detail: "Eerdere pitches / outbound mails om AI te calibreren.",
    ownerHint: "Sales",
  },
  {
    id: "availability-source",
    tool: "outreach",
    title: "Bron beschikbaarheid",
    detail:
      "Wie beheert open B2B-data? Spreadsheet, intern systeem, of handmatig in onze tool?",
    ownerHint: "Events / sales",
  },
  {
    id: "pricing-rules",
    tool: "outreach",
    title: "Dynamic pricing regels",
    detail:
      "Basisprijzen per dagdeel/area, toeslagen, last-minute, wat mag publiek getoond worden.",
    ownerHint: "Sales / management",
  },
  {
    id: "creatives",
    tool: "dashboard",
    title: "Voorbeeld creatives",
    detail: "Assets per editie voor visual recognition calibratie.",
    ownerHint: "Marketing",
  },
  {
    id: "contacts",
    tool: "both",
    title: "Contactpersonen",
    detail: "Acceptatie-contact marketing + management + sales.",
    ownerHint: "Thuishaven",
  },
];

export function getEnvPresence(keys: string[]): {
  present: string[];
  missing: string[];
} {
  const present: string[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    if (process.env[key]?.trim()) present.push(key);
    else missing.push(key);
  }
  return { present, missing };
}
