import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ─── Auth / medewerkers ───────────────────────────────────────────────── */

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export const appUsers = pgTable("app_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  inviteSentAt: timestamp("invite_sent_at", { withTimezone: true }),
  passwordSetAt: timestamp("password_set_at", { withTimezone: true }),
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authTokenTypeEnum = pgEnum("auth_token_type", [
  "invite",
  "password_reset",
]);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    type: authTokenTypeEnum("type").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_tokens_user_type_idx").on(table.userId, table.type),
    index("auth_tokens_hash_idx").on(table.tokenHash),
  ],
);

/** Shared: editions / events that link marketing + tickets (+ later outreach). */
export const editions = pgTable("editions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  status: text("status").notNull().default("upcoming"),
  weeztixEventId: text("weeztix_event_id"),
  raEventId: text("ra_event_id"),
  ticketswapEventId: text("ticketswap_event_id"),
  appicEventId: text("appic_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ─── Outreach (Bedrijfsevent) ─────────────────────────────────────────── */

export const prospectTypeEnum = pgEnum("prospect_type", ["company", "agency"]);
export const prospectStatusEnum = pgEnum("prospect_status", [
  "discovered",
  "enriched",
  "ready",
  "contacted",
  "opened",
  "replied",
  "lead",
  "excluded",
  "unreachable",
]);

export const prospects = pgTable("prospects", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: prospectTypeEnum("type").notNull(),
  companyName: text("company_name").notNull(),
  kvkNumber: text("kvk_number"),
  sector: text("sector"),
  employeeCount: integer("employee_count"),
  city: text("city"),
  foundedAt: timestamp("founded_at", { withTimezone: true }),
  anniversaryYears: integer("anniversary_years"),
  email: text("email"),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  status: prospectStatusEnum("status").notNull().default("discovered"),
  excludedReason: text("excluded_reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  audience: prospectTypeEnum("audience").notNull(),
  status: campaignStatusEnum("status").notNull().default("draft"),
  description: text("description"),
  sentCount: integer("sent_count").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  leadCount: integer("lead_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const outreachEmailStatusEnum = pgEnum("outreach_email_status", [
  "draft",
  "queued",
  "sent",
  "opened",
  "clicked",
  "replied",
  "bounced",
  "opted_out",
]);

export const mailVariantStatusEnum = pgEnum("mail_variant_status", [
  "draft",
  "testing",
  "active",
  "paused",
]);

export const mailVariants = pgTable("mail_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  groupKey: text("group_key").notNull(),
  name: text("name").notNull(),
  audience: prospectTypeEnum("audience").notNull(),
  bodyTemplate: text("body_template").notNull(),
  includeAvailabilityLink: boolean("include_availability_link")
    .notNull()
    .default(true),
  status: mailVariantStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mailSubjects = pgTable("mail_subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => mailVariants.id),
  subjectTemplate: text("subject_template").notNull(),
  sentCount: integer("sent_count").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  leadCount: integer("lead_count").notNull().default(0),
  availabilityClickCount: integer("availability_click_count")
    .notNull()
    .default(0),
});

export const outreachEmails = pgTable("outreach_emails", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  prospectId: uuid("prospect_id")
    .notNull()
    .references(() => prospects.id),
  variantId: uuid("variant_id").references(() => mailVariants.id),
  subjectId: uuid("subject_id").references(() => mailSubjects.id),
  /** App-level A/B keys (warm_tour / open_dates / …) */
  variantKey: text("variant_key"),
  /** A/B subject arm: a | b */
  subjectKey: text("subject_key"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: outreachEmailStatusEnum("status").notNull().default("draft"),
  brevoMessageId: text("brevo_message_id"),
  availabilityLinkToken: text("availability_link_token"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const inboundReplies = pgTable("inbound_replies", {
  id: uuid("id").defaultRandom().primaryKey(),
  outreachEmailId: uuid("outreach_email_id").references(() => outreachEmails.id),
  prospectId: uuid("prospect_id").references(() => prospects.id),
  fromEmail: text("from_email").notNull(),
  subject: text("subject"),
  bodyPreview: text("body_preview"),
  sentiment: text("sentiment"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  prospectId: uuid("prospect_id")
    .notNull()
    .references(() => prospects.id),
  outreachEmailId: uuid("outreach_email_id").references(() => outreachEmails.id),
  summary: text("summary"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exclusions = pgTable("exclusions", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email"),
  companyName: text("company_name"),
  kvkNumber: text("kvk_number"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const availabilitySlots = pgTable("availability_slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  slotType: text("slot_type").notNull(),
  label: text("label").notNull(),
  isOpen: boolean("is_open").notNull().default(true),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const venueDayStatusEnum = pgEnum("venue_day_status", [
  "available",
  "booked_external",
  "own_event",
  "closed",
  "hold",
]);

export const venueDays = pgTable("venue_days", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  status: venueDayStatusEnum("status").notNull().default("available"),
  dayPart: text("day_part").notNull().default("full"),
  label: text("label"),
  priceFrom: numeric("price_from", { precision: 10, scale: 2 }),
  priceNote: text("price_note"),
  areas: jsonb("areas").$type<string[]>().default([]),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ─── Marketing & Ticket Dashboard ─────────────────────────────────────── */

export const ticketPlatformEnum = pgEnum("ticket_platform", [
  "weeztix",
  "resident_advisor",
  "appic",
  "vrienden",
  "ticketswap",
  "internal",
]);

export const ticketSales = pgTable("ticket_sales", {
  id: uuid("id").defaultRandom().primaryKey(),
  editionId: uuid("edition_id")
    .notNull()
    .references(() => editions.id),
  platform: ticketPlatformEnum("platform").notNull(),
  ticketType: text("ticket_type"),
  price: numeric("price", { precision: 10, scale: 2 }),
  quantity: integer("quantity").notNull().default(0),
  soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
  externalId: text("external_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Dagelijkse sold/revenue per editie — voor mail-attributie en curves. */
export const ticketSalesDaily = pgTable(
  "ticket_sales_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id),
    platform: ticketPlatformEnum("platform").notNull(),
    day: date("day").notNull(),
    sold: integer("sold").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("ticket_sales_daily_edition_platform_day").on(
      t.editionId,
      t.platform,
      t.day,
    ),
  ],
);

/**
 * Order-referrers uit Weeztix statistics (waar kwam de koper vandaan).
 * Brevo-tracking loopt via r.routage*.arenametrix.fr → channel = brevo.
 */
export const ticketSaleReferrers = pgTable(
  "ticket_sale_referrers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id),
    platform: ticketPlatformEnum("platform").notNull(),
    referrer: text("referrer").notNull(),
    channel: text("channel").notNull().default("other"),
    orderCount: integer("order_count").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("ticket_sale_referrers_edition_platform_ref").on(
      t.editionId,
      t.platform,
      t.referrer,
    ),
  ],
);

export type DemographicBucket = { key: string; count: number };

/**
 * Geanonimiseerde Weeztix-demografie per editie (geslacht, leeftijd, stad).
 * Geen namen, e-mails of exacte geboortedata — alleen tellingen.
 */
export const ticketDemographics = pgTable(
  "ticket_demographics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id),
    platform: ticketPlatformEnum("platform").notNull(),
    gender: jsonb("gender").$type<DemographicBucket[]>().notNull().default([]),
    age: jsonb("age").$type<DemographicBucket[]>().notNull().default([]),
    city: jsonb("city").$type<DemographicBucket[]>().notNull().default([]),
    answered: integer("answered").notNull().default(0),
    total: integer("total").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("ticket_demographics_edition_platform").on(
      t.editionId,
      t.platform,
    ),
  ],
);

/** OAuth tokens (Weeztix refresh is éénmalig — niet in env laten staan). */
export const integrationCredentials = pgTable("integration_credentials", {
  provider: text("provider").primaryKey(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  /** Serverless mutex: wie refresh doet tot dit tijdstip. */
  refreshLockUntil: timestamp("refresh_lock_until", { withTimezone: true }),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const integrationLogLevelEnum = pgEnum("integration_log_level", [
  "info",
  "error",
]);

/** Koppelingen-log — token refresh, OAuth, API-fouten. */
export const integrationLogs = pgTable(
  "integration_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    level: integrationLogLevelEnum("level").notNull(),
    event: text("event").notNull(),
    message: text("message").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("integration_logs_created_at").on(t.createdAt)],
);

/** Resident Advisor public listings (attending ≠ Weeztix sold). */
export const raListings = pgTable(
  "ra_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    raEventId: text("ra_event_id").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    attending: integer("attending").notNull().default(0),
    isTicketed: boolean("is_ticketed").notNull().default(false),
    soldOut: boolean("sold_out").notNull().default(false),
    ticketsAvailable: boolean("tickets_available").notNull().default(false),
    contentUrl: text("content_url"),
    /** DJ / artist names from RA event.artists */
    artists: jsonb("artists").$type<string[]>().notNull().default([]),
    editionId: uuid("edition_id").references(() => editions.id),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("ra_listings_ra_event_id").on(t.raEventId)],
);

/** TicketSwap public listings (secundaire markt). */
export const ticketswapListings = pgTable(
  "ticketswap_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tsEventId: text("ts_event_id").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    availableCount: integer("available_count").notNull().default(0),
    contentUrl: text("content_url"),
    editionId: uuid("edition_id").references(() => editions.id),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("ticketswap_listings_ts_event_id").on(t.tsEventId)],
);

export const ticketInventory = pgTable("ticket_inventory", {
  id: uuid("id").defaultRandom().primaryKey(),
  editionId: uuid("edition_id")
    .notNull()
    .references(() => editions.id),
  platform: ticketPlatformEnum("platform").notNull(),
  capacity: integer("capacity"),
  sold: integer("sold").notNull().default(0),
  /** Weeztix scanned_count som over tickettypes (check-in). */
  scanned: integer("scanned").notNull().default(0),
  available: integer("available").notNull().default(0),
  /** Betaalde tickets (Weeztix min_price > 0). */
  paidSold: integer("paid_sold").notNull().default(0),
  /** Gratis / guestlist (Weeztix min_price = 0). */
  freeSold: integer("free_sold").notNull().default(0),
  /** Ticketomzet in centen (Weeztix min_price × sold, geen servicekosten). */
  revenueCents: integer("revenue_cents").notNull().default(0),
  /** Gewogen gem. ticketprijs in EUR (uit Weeztix min_price × sold). */
  avgPriceEur: numeric("avg_price_eur", { precision: 10, scale: 2 }),
  isSoldOut: boolean("is_sold_out").notNull().default(false),
  /** Amsterdam YYYY-MM-DD when sell-out was reached (from ticket-type timestamps). */
  soldOutDay: text("sold_out_day"),
  soldOutDaysBefore: integer("sold_out_days_before"),
  soldOutSource: text("sold_out_source"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketingChannelEnum = pgEnum("marketing_channel", [
  "instagram",
  "tiktok",
  "youtube",
  "brevo",
  "other",
]);

export type MarketingVisualFeatures = {
  dominantColors?: string[];
  hasTextOverlay?: boolean;
  format?: string;
  composition?: string | null;
  /** Gemini / vision fields (fase D) */
  subjects?: string[];
  textInImage?: string | null;
  artists?: string[];
  offer?:
    | "lineup"
    | "early_bird"
    | "sold_out"
    | "aftermovie"
    | "recap"
    | "door"
    | "other";
  mood?: string | null;
  palette?: string[];
  editionGuess?: string | null;
};

export const marketingPosts = pgTable(
  "marketing_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    editionId: uuid("edition_id").references(() => editions.id),
    channel: marketingChannelEnum("channel").notNull(),
    externalId: text("external_id"),
    title: text("title"),
    caption: text("caption"),
    permalink: text("permalink"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    reach: integer("reach").default(0),
    impressions: integer("impressions").default(0),
    engagement: integer("engagement").default(0),
    clicks: integer("clicks").default(0),
    likeCount: integer("like_count").default(0),
    commentCount: integer("comment_count").default(0),
    shareCount: integer("share_count").default(0),
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    /** Duurzame kopie (Vercel Blob); Instagram CDN verloopt. */
    storedMediaUrl: text("stored_media_url"),
    /** Speelbare video-URL (IG video/reel); YouTube/TikTok gebruiken embed via externalId. */
    videoUrl: text("video_url"),
    visualFeatures: jsonb("visual_features").$type<MarketingVisualFeatures>(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("marketing_posts_channel_external").on(t.channel, t.externalId),
    index("marketing_posts_published_at").on(t.publishedAt),
  ],
);

export const emailCampaignMetrics = pgTable("email_campaign_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  editionId: uuid("edition_id").references(() => editions.id),
  brevoCampaignId: text("brevo_campaign_id"),
  name: text("name").notNull(),
  sent: integer("sent").default(0),
  opens: integer("opens").default(0),
  clicks: integer("clicks").default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alertTypeEnum = pgEnum("alert_type", [
  "ticketswap_after_soldout",
  "weeztix_soldout_ra_open",
  "sync_failure",
  "custom",
]);

/** Handmatig ingestelde sold-out / drempel-alerts. */
export const alertRules = pgTable("alert_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
  /** Weeztix sold-drempel. Null = alleen bij officiële sold-out. */
  soldThreshold: integer("sold_threshold"),
  checkRa: boolean("check_ra").notNull().default(true),
  checkTicketswap: boolean("check_ticketswap").notNull().default(true),
  checkAppic: boolean("check_appic").notNull().default(false),
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  editionId: uuid("edition_id").references(() => editions.id),
  ruleId: uuid("rule_id").references(() => alertRules.id, {
    onDelete: "set null",
  }),
  type: alertTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: text("source").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
});

/** Usage / cost events for outreach (AI tokens, KvK, Brevo, Places, …). */
export const usageVendorEnum = pgEnum("usage_vendor", [
  "openai",
  "anthropic",
  "brevo",
  "kvk",
  "google_places",
  "enrichment",
  "other",
]);

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tool: text("tool").notNull().default("outreach"),
  vendor: usageVendorEnum("vendor").notNull(),
  operation: text("operation").notNull(),
  units: integer("units").notNull().default(1),
  unitLabel: text("unit_label").notNull().default("call"),
  costEurCents: integer("cost_eur_cents").notNull().default(0),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ─── Externe factoren (weer + festivals) ──────────────────────────────── */

export const weatherDaily = pgTable(
  "weather_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Calendar day (UTC date at midnight). */
    day: timestamp("day", { withTimezone: true }).notNull(),
    locationKey: text("location_key").notNull().default("amsterdam"),
    locationLabel: text("location_label").notNull().default("Amsterdam"),
    tempMinC: numeric("temp_min_c", { precision: 5, scale: 2 }),
    tempMaxC: numeric("temp_max_c", { precision: 5, scale: 2 }),
    precipMm: numeric("precip_mm", { precision: 6, scale: 2 }),
    windMaxMps: numeric("wind_max_mps", { precision: 5, scale: 2 }),
    weatherCode: integer("weather_code"),
    source: text("source").notNull().default("open-meteo"),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("weather_daily_day_loc").on(t.day, t.locationKey)],
);

export const externalEventTypeEnum = pgEnum("external_event_type", [
  "festival",
  "holiday",
  "other",
]);

export const externalEvents = pgTable("external_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  type: externalEventTypeEnum("type").notNull().default("festival"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  region: text("region").notNull().default("Amsterdam"),
  impactNote: text("impact_note"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Handmatige externe events op het ticketssheet (alleen verwachte bezoekers). */
export const externalTicketEvents = pgTable("external_ticket_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expectedAttendees: integer("expected_attendees").notNull(),
  /** Werkelijke check-ins na afloop — handmatig ingevuld. */
  scanned: integer("scanned"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type InsightsChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Insights Gemini-gesprekken — 14 dagen bewaard. */
export const insightsChats = pgTable(
  "insights_chats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Nieuw gesprek"),
    messages: jsonb("messages")
      .$type<InsightsChatMessage[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("insights_chats_user_updated").on(t.userId, t.updatedAt)],
);
