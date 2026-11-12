import {
  AMSTERDAM_SYNC_HOURS,
  WEEZTIX_SYNC_HOURS,
} from "@/lib/time/amsterdam";

/**
 * Everything the app watches. A monitor can have:
 * - an `integrationId` → live probe from lib/integrations/verify.ts (auth/config)
 * - a `schedule` → cron runs recorded in sync_jobs (failed / stale detection)
 * - a `credentialProvider` → token expiry from integration_credentials
 */
export type MonitorSchedule =
  | { kind: "hours"; hours: readonly number[] } // Europe/Amsterdam local hours
  | { kind: "interval"; minutes: number };

export type MonitorDef = {
  id: string;
  label: string;
  integrationId?: string;
  /** sync_jobs.source written by runCron. Defaults to `id`. */
  cronSource?: string;
  schedule?: MonitorSchedule;
  /** route maxDuration — a "running" row older than this timed out. */
  maxDurationSec?: number;
  credentialProvider?: string;
  /** Warn this many days before the token expires (default 14). */
  tokenWarnDays?: number;
  /** What users lose when this breaks, in plain Dutch. */
  impact: string;
  /** Pages (path prefixes) that show this data. */
  pages: string[];
};

const SHARED_SLOTS = { kind: "hours", hours: AMSTERDAM_SYNC_HOURS } as const;

export const MONITORS: MonitorDef[] = [
  {
    id: "database",
    label: "Database",
    integrationId: "database",
    impact: "Het dashboard kan geen gegevens laden of opslaan.",
    pages: ["/"],
  },
  {
    id: "weeztix",
    label: "Weeztix",
    integrationId: "weeztix",
    schedule: { kind: "hours", hours: WEEZTIX_SYNC_HOURS },
    maxDurationSec: 300,
    credentialProvider: "weeztix",
    impact: "Ticketverkoop, voorraad en omzet kunnen verouderd zijn.",
    pages: ["/dashboard/tickets", "/dashboard/inzichten", "/dashboard/omzet", "/dashboard/edities"],
  },
  {
    id: "ticketswap",
    label: "TicketSwap",
    integrationId: "ticketswap",
    schedule: SHARED_SLOTS,
    maxDurationSec: 60,
    impact: "TicketSwap-listings en uitverkocht-alerts kunnen achterlopen.",
    pages: ["/dashboard/alerts", "/dashboard/tickets"],
  },
  {
    id: "resident_advisor",
    label: "Resident Advisor",
    integrationId: "resident_advisor",
    cronSource: "ra",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    impact: "RA-listings en concurrentie-data kunnen verouderd zijn.",
    pages: ["/dashboard/inzichten", "/dashboard/alerts"],
  },
  {
    id: "brevo",
    label: "Brevo",
    integrationId: "brevo",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    impact: "Mailcijfers lopen achter en mails (alerts, uitnodigingen, outreach) kunnen niet weg.",
    pages: ["/dashboard/mails", "/outreach"],
  },
  {
    id: "instagram",
    label: "Instagram / Facebook",
    integrationId: "instagram",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    credentialProvider: "instagram",
    // The app renews this token itself 7 days before expiry; only warn once
    // that renewal should already have happened.
    tokenWarnDays: 6,
    impact: "Organische Meta-cijfers kunnen verouderd zijn.",
    pages: ["/dashboard/meta"],
  },
  {
    id: "meta_ads",
    label: "Meta ads",
    integrationId: "meta_ads",
    cronSource: "meta-ads",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    impact: "Meta-advertentiecijfers kunnen verouderd zijn.",
    pages: ["/dashboard/paid/meta"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    integrationId: "tiktok",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    credentialProvider: "tiktok",
    impact: "Organische TikTok-cijfers kunnen verouderd zijn.",
    pages: ["/dashboard/tiktok"],
  },
  {
    id: "tiktok_ads",
    label: "TikTok ads",
    integrationId: "tiktok_ads",
    cronSource: "tiktok-ads",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    credentialProvider: "tiktok_ads",
    impact: "TikTok-advertentiecijfers kunnen verouderd zijn.",
    pages: ["/dashboard/paid/tiktok"],
  },
  {
    id: "youtube",
    label: "YouTube",
    integrationId: "youtube",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    impact: "YouTube-cijfers kunnen verouderd zijn.",
    pages: ["/dashboard/youtube"],
  },
  {
    id: "youtube_ads",
    label: "YouTube ads",
    integrationId: "youtube_ads",
    cronSource: "youtube-ads",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    impact: "YouTube-advertentiecijfers kunnen verouderd zijn.",
    pages: ["/dashboard/paid/youtube"],
  },
  {
    id: "google_ads",
    label: "Google Ads",
    integrationId: "google_ads",
    cronSource: "google-ads",
    schedule: SHARED_SLOTS,
    maxDurationSec: 300,
    impact: "Google Ads-cijfers kunnen verouderd zijn.",
    pages: ["/dashboard/paid/google"],
  },
  {
    id: "open_meteo",
    label: "Weer (Open-Meteo)",
    integrationId: "open_meteo",
    impact: "Weerdata en weer-alerts kunnen ontbreken.",
    pages: ["/dashboard/weer"],
  },
  {
    id: "ai",
    label: "AI (Claude / Gemini)",
    integrationId: "ai",
    impact: "Outreach-mails en de dashboard-chat kunnen niet gegenereerd worden.",
    pages: ["/outreach", "/dashboard/chat"],
  },
  {
    id: "alert_notify",
    label: "Alertmails",
    integrationId: "alert_notify",
    impact: "Alerts verschijnen wel in het dashboard, maar er gaan geen mails uit.",
    pages: ["/dashboard/alerts"],
  },
  {
    id: "kvk",
    label: "KvK",
    integrationId: "kvk",
    impact: "Bedrijfsgegevens in outreach worden niet aangevuld.",
    pages: ["/outreach"],
  },
  {
    id: "apollo",
    label: "Apollo",
    integrationId: "apollo",
    impact: "Nieuwe outreach-contacten worden niet gevonden.",
    pages: ["/outreach"],
  },
  {
    id: "hunter",
    label: "Hunter",
    integrationId: "hunter",
    impact: "E-mailadressen in outreach worden niet aangevuld.",
    pages: ["/outreach"],
  },
  {
    id: "google_places",
    label: "Google Places",
    integrationId: "google_places",
    impact: "Bedrijven zoeken in outreach werkt niet.",
    pages: ["/outreach"],
  },
  {
    id: "outreach_send",
    label: "Outreach verzenden",
    cronSource: "outreach-send",
    schedule: { kind: "interval", minutes: 10 },
    maxDurationSec: 60,
    impact: "Ingeplande outreach-mails worden niet verstuurd.",
    pages: ["/outreach"],
  },
  {
    id: "outreach_followup",
    label: "Outreach follow-ups",
    cronSource: "outreach-followup",
    schedule: { kind: "interval", minutes: 24 * 60 },
    maxDurationSec: 300,
    impact: "Er worden geen follow-up concepten klaargezet.",
    pages: ["/outreach"],
  },
  {
    id: "dj_fees_sheet",
    label: "DJ-fees Google Sheet",
    cronSource: "dj-fees-sheet",
    schedule: { kind: "interval", minutes: 24 * 60 },
    maxDurationSec: 300,
    impact: "DJ-fees lopen achter op de Google Sheet van de klant.",
    pages: ["/dashboard/dj-fees"],
  },
  {
    id: "sales_digest",
    label: "Dagelijkse verkoopmail",
    cronSource: "sales-digest",
    schedule: { kind: "hours", hours: [18] },
    maxDurationSec: 60,
    impact: "De verkoopmail van 18:00 is niet verstuurd.",
    pages: ["/dashboard/tickets"],
  },
  {
    id: "radar",
    label: "DJ Radar",
    cronSource: "radar",
    schedule: { kind: "hours", hours: [8, 20] },
    maxDurationSec: 300,
    impact: "Radar discovery, scores en social-signalen lopen achter.",
    pages: ["/radar"],
  },
  {
    id: "apify",
    label: "Apify (Radar social)",
    integrationId: "apify",
    impact: "IG-volgersgroei en gig-hints uit posts worden niet ververst.",
    pages: ["/radar"],
  },
  {
    id: "radar_youtube",
    label: "YouTube (Radar mixseries)",
    integrationId: "youtube",
    impact: "Boiler Room / HÖR set-views en viral mixseries-alerts lopen achter.",
    pages: ["/radar"],
  },
];

export function cronSourceOf(def: MonitorDef): string {
  return def.cronSource ?? def.id;
}
