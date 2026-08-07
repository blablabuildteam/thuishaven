import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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

export const outreachEmails = pgTable("outreach_emails", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  prospectId: uuid("prospect_id")
    .notNull()
    .references(() => prospects.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: outreachEmailStatusEnum("status").notNull().default("draft"),
  brevoMessageId: text("brevo_message_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

/* ─── Marketing & Ticket Dashboard ─────────────────────────────────────── */

export const ticketPlatformEnum = pgEnum("ticket_platform", [
  "weeztix",
  "resident_advisor",
  "appic",
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

export const ticketInventory = pgTable("ticket_inventory", {
  id: uuid("id").defaultRandom().primaryKey(),
  editionId: uuid("edition_id")
    .notNull()
    .references(() => editions.id),
  platform: ticketPlatformEnum("platform").notNull(),
  capacity: integer("capacity"),
  sold: integer("sold").notNull().default(0),
  available: integer("available").notNull().default(0),
  isSoldOut: boolean("is_sold_out").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketingChannelEnum = pgEnum("marketing_channel", [
  "instagram",
  "tiktok",
  "youtube",
  "brevo",
  "other",
]);

export const marketingPosts = pgTable("marketing_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  editionId: uuid("edition_id").references(() => editions.id),
  channel: marketingChannelEnum("channel").notNull(),
  externalId: text("external_id"),
  title: text("title"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  reach: integer("reach").default(0),
  impressions: integer("impressions").default(0),
  engagement: integer("engagement").default(0),
  clicks: integer("clicks").default(0),
  mediaUrl: text("media_url"),
  thumbnailUrl: text("thumbnail_url"),
  visualFeatures: jsonb("visual_features").$type<{
    dominantColors?: string[];
    hasTextOverlay?: boolean;
    format?: string;
    composition?: string;
  }>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

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
  "sync_failure",
  "custom",
]);

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  editionId: uuid("edition_id").references(() => editions.id),
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
