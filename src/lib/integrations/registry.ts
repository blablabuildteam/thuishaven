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
    id: "auth",
    name: "Medewerker-login",
    tool: "shared",
    description:
      "Auth.js sessies voor Thuishaven-medewerkers. Publiek blijft alleen /beschikbaar.",
    envKeys: ["AUTH_SECRET"],
    optionalEnvKeys: [
      "AUTH_ALLOWED_EMAILS",
      "AUTH_PASSWORD",
      "AUTH_PASSWORD_HASH",
      "AUTH_USERS_JSON",
    ],
    askFromClient: [
      "Lijst e-mailadressen van medewerkers die toegang nodig hebben",
    ],
    verifyHint: "AUTH_SECRET + users gezet; test /login",
    priority: "critical",
  },
  {
    id: "database",
    name: "PostgreSQL (Neon)",
    tool: "shared",
    description:
      "Vercel Postgres / Neon — edities, tickets, users, usage, weer en festivals.",
    envKeys: ["DATABASE_URL"],
    askFromClient: [],
    verifyHint: "select 1 + schema push",
    priority: "critical",
  },
  {
    id: "open_meteo",
    name: "Open-Meteo (weer)",
    tool: "dashboard",
    description:
      "Dagelijkse weerdata Amsterdam — correlatie met kaartverkoop. Geen API-key nodig.",
    envKeys: [],
    askFromClient: [],
    verifyHint: "Archive/forecast ping AMS",
    docsUrl: "https://open-meteo.com/",
    priority: "high",
  },
  {
    id: "brevo",
    name: "Brevo",
    tool: "shared",
    description:
      "E-mail metrics + campagnes — eerst read-only (GET account/campagnes). Verzenden later apart aanzetten.",
    envKeys: ["BREVO_API_KEY"],
    optionalEnvKeys: ["BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME"],
    askFromClient: [
      "API-key met leesrechten (Settings → SMTP & API)",
      "Sender e-mail (later, alleen nodig voor versturen)",
    ],
    verifyHint: "GET /v3/account (read-only)",
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
    description:
      "Ticketverkoop + voorraad — read-only. Access token verloopt na ~3 dagen; refresh is éénmalig en wordt in de database bewaard.",
    envKeys: ["WEEZTIX_CLIENT_ID"],
    optionalEnvKeys: [
      "WEEZTIX_ACCESS_TOKEN",
      "WEEZTIX_API_URL",
      "WEEZTIX_COMPANY_GUID",
      "WEEZTIX_CLIENT_SECRET",
      "WEEZTIX_REFRESH_TOKEN",
      "WEEZTIX_API_KEY", // legacy alias voor access token
    ],
    askFromClient: [
      "OAuth Client in Weeztix (Company settings → OAuth Clients)",
      "Access token (of refresh token + client id) — read scope",
      "Company GUID indien meerdere companies",
    ],
    verifyHint: "GET auth.weeztix.com/users/me + GET /event",
    docsUrl: "https://docs.weeztix.com/docs/introduction/authentication/",
    priority: "critical",
  },
  {
    id: "resident_advisor",
    name: "Resident Advisor",
    tool: "dashboard",
    description:
      "Publieke listings voor club Thuishaven (ra.co/clubs/109027): attending, ticketed, sold-out in de titel. Geen ticket-sold zoals Weeztix — RA heeft geen officiële sales-API.",
    envKeys: [],
    optionalEnvKeys: ["RA_VENUE_ID", "RA_API_KEY"],
    askFromClient: [
      "Club-ID staat default op 109027 (Thuishaven)",
      "Voor echte RA-ticketverkopen: exporter uit promoter-dashboard (bestaat geen publieke sales-API)",
    ],
    verifyHint: "GraphQL venue + listings (read-only)",
    docsUrl: "https://ra.co/clubs/109027",
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
    description:
      "Prospectidentificatie, medewerkers, oprichtingsdatum/jubilea. Wij zetten op; abonnement + credits op Thuishaven-account.",
    envKeys: ["KVK_API_KEY"],
    optionalEnvKeys: ["KVK_API_URL"],
    askFromClient: [
      "Thuishaven-account bij KvK (wij richten API in; credits/facturatie op jullie)",
      "Wie mag het KvK Developer Portal-account beheren / ons uitnodigen",
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
  {
    id: "google_places",
    name: "Google Places",
    tool: "outreach",
    description: "Aanvullende bedrijven op locatie/categorie in de regio AMS.",
    envKeys: ["GOOGLE_PLACES_API_KEY"],
    askFromClient: ["Akkoord Google Places als aanvullende bron"],
    verifyHint: "Places Text (textsearch)",
    priority: "later",
  },
  {
    id: "enrichment",
    name: "Enrichment API",
    tool: "outreach",
    description: "Apollo/Hunter/Clearbit-achtige verrijking naast KvK.",
    envKeys: ["ENRICHMENT_API_KEY"],
    askFromClient: ["Voorkeurspartner + budget"],
    verifyHint: "Account/ping endpoint van gekozen vendor",
    priority: "later",
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
