export type Edition = {
  id: string;
  name: string;
  slug: string;
  startsAt: string;
  status: "live" | "upcoming" | "past";
};

export type TicketPlatform =
  | "weeztix"
  | "resident_advisor"
  | "appic"
  | "ticketswap"
  | "internal";

export const editions: Edition[] = [
  {
    id: "ed-summer-26",
    name: "Thuishaven Summer Special",
    slug: "summer-special-2026",
    startsAt: "2026-08-15T16:00:00+02:00",
    status: "live",
  },
  {
    id: "ed-warehouse-26",
    name: "Warehouse Sessions #12",
    slug: "warehouse-12",
    startsAt: "2026-09-06T15:00:00+02:00",
    status: "upcoming",
  },
  {
    id: "ed-spring-26",
    name: "Spring Opening",
    slug: "spring-opening-2026",
    startsAt: "2026-04-19T14:00:00+02:00",
    status: "past",
  },
];

export const ticketInventory = [
  {
    editionId: "ed-summer-26",
    platform: "weeztix" as TicketPlatform,
    capacity: 3500,
    sold: 3180,
    available: 320,
    isSoldOut: false,
  },
  {
    editionId: "ed-summer-26",
    platform: "resident_advisor" as TicketPlatform,
    capacity: 800,
    sold: 800,
    available: 0,
    isSoldOut: true,
  },
  {
    editionId: "ed-summer-26",
    platform: "appic" as TicketPlatform,
    capacity: 400,
    sold: 286,
    available: 114,
    isSoldOut: false,
  },
  {
    editionId: "ed-summer-26",
    platform: "ticketswap" as TicketPlatform,
    capacity: null,
    sold: 142,
    available: 38,
    isSoldOut: false,
  },
  {
    editionId: "ed-summer-26",
    platform: "internal" as TicketPlatform,
    capacity: 200,
    sold: 95,
    available: 105,
    isSoldOut: false,
  },
];

export const salesByDay = [
  { day: "ma 28", weeztix: 120, ra: 40, appic: 18, ticketswap: 8 },
  { day: "di 29", weeztix: 95, ra: 55, appic: 22, ticketswap: 12 },
  { day: "wo 30", weeztix: 180, ra: 70, appic: 30, ticketswap: 15 },
  { day: "do 31", weeztix: 210, ra: 90, appic: 28, ticketswap: 22 },
  { day: "vr 01", weeztix: 340, ra: 110, appic: 45, ticketswap: 31 },
  { day: "za 02", weeztix: 420, ra: 140, appic: 52, ticketswap: 28 },
  { day: "zo 03", weeztix: 280, ra: 95, appic: 35, ticketswap: 19 },
];

export const marketingPosts = [
  {
    id: "mp-1",
    editionId: "ed-summer-26",
    channel: "instagram" as const,
    title: "Line-up reveal · Summer Special",
    publishedAt: "2026-07-28T18:00:00+02:00",
    reach: 48200,
    engagement: 3120,
    clicks: 890,
    ticketsAroundPublish: 186,
    visualFeatures: {
      dominantColors: ["#c8f542", "#0c0c0b", "#ff5c35"],
      hasTextOverlay: true,
      format: "carousel",
      composition: "centered-subject",
    },
  },
  {
    id: "mp-2",
    editionId: "ed-summer-26",
    channel: "tiktok" as const,
    title: "Warehouse walkthrough",
    publishedAt: "2026-07-30T12:30:00+02:00",
    reach: 92100,
    engagement: 8400,
    clicks: 1420,
    ticketsAroundPublish: 248,
    visualFeatures: {
      dominantColors: ["#1a1a17", "#ff8a3d", "#eceae3"],
      hasTextOverlay: false,
      format: "vertical-video",
      composition: "motion-heavy",
    },
  },
  {
    id: "mp-3",
    editionId: "ed-summer-26",
    channel: "youtube" as const,
    title: "Aftermovie Spring Opening",
    publishedAt: "2026-07-22T10:00:00+02:00",
    reach: 21400,
    engagement: 1680,
    clicks: 540,
    ticketsAroundPublish: 97,
    visualFeatures: {
      dominantColors: ["#0c0c0b", "#6eb6ff", "#c8f542"],
      hasTextOverlay: true,
      format: "landscape-video",
      composition: "crowd-energy",
    },
  },
  {
    id: "mp-4",
    editionId: "ed-summer-26",
    channel: "brevo" as const,
    title: "Early bird reminder",
    publishedAt: "2026-07-25T09:00:00+02:00",
    reach: 12400,
    engagement: 2100,
    clicks: 980,
    ticketsAroundPublish: 312,
    visualFeatures: {
      dominantColors: ["#c8f542", "#0c0c0b"],
      hasTextOverlay: true,
      format: "email",
      composition: "text-led",
    },
  },
];

export const emailCampaigns = [
  {
    id: "em-1",
    name: "Summer Special — early bird",
    sent: 12400,
    opens: 4680,
    clicks: 980,
    sentAt: "2026-07-25T09:00:00+02:00",
  },
  {
    id: "em-2",
    name: "Line-up drop",
    sent: 11890,
    opens: 5120,
    clicks: 1340,
    sentAt: "2026-07-28T18:15:00+02:00",
  },
];

export const activeAlerts = [
  {
    id: "al-1",
    editionId: "ed-summer-26",
    type: "ticketswap_after_soldout" as const,
    title: "TicketSwap actief na RA sold-out",
    message:
      "Resident Advisor is uitverkocht, maar er staan nog 38 tickets op TicketSwap. Mogelijke omzetlek.",
    isActive: true,
    createdAt: "2026-08-06T14:22:00+02:00",
  },
];

export const dashboardKpis = {
  totalSold: 4503,
  revenueEstimate: 187650,
  openRate: 39.2,
  bestChannel: "TikTok",
  ticketsLast24h: 214,
};

export const chatSuggestions = [
  "Waarom verkoopt Summer Special beter dan Spring Opening?",
  "Welke Instagram-post leverde de meeste tickets op?",
  "Hoeveel tickets gingen via TicketSwap na RA sold-out?",
  "Welke kleuren in creatives converteren het best?",
];

export const platformLabels: Record<TicketPlatform, string> = {
  weeztix: "Weeztix",
  resident_advisor: "Resident Advisor",
  appic: "Appic",
  ticketswap: "TicketSwap",
  internal: "Intern",
};
