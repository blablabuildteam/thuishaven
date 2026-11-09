/**
 * DJ Talenten Radar — own tables, prefixed `radar_*`.
 * Kept in this module so the tool can later move to a standalone Vercel app
 * with shared auth still talking to the same (or forked) database.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Soft refs to app_users.id — no FK so this module stays extractable. */

export const radarArtistStatusEnum = pgEnum("radar_artist_status", [
  "new",
  "watching",
  "shortlist",
  "contacted",
  "booked",
  "passed",
  "not_relevant",
]);

export const radarVenueKindEnum = pgEnum("radar_venue_kind", [
  "club",
  "festival",
  "other",
]);

export const radarVenueStatusEnum = pgEnum("radar_venue_status", [
  "seed",
  "suggested",
  "accepted",
  "rejected",
]);

export const radarVenueTierEnum = pgEnum("radar_venue_tier", [
  "early",
  "mid",
  "major",
  "festival",
  "series",
]);

export const radarPlatformEnum = pgEnum("radar_platform", [
  "spotify",
  "instagram",
  "tiktok",
  "soundcloud",
  "resident_advisor",
]);

export const radarDiscoverySourceEnum = pgEnum("radar_discovery_source", [
  "seed",
  "lineup",
  "snowball",
  "label",
  "manual",
  "spotify",
  "support",
]);

export const radarAlertKindEnum = pgEnum("radar_alert_kind", [
  "velocity",
  "new_on_radar",
  "venue_suggestion",
  "lineup",
  "digest",
  "breakthrough",
  "window_closing",
]);

export const radarMatchConfidenceEnum = pgEnum("radar_match_confidence", [
  "high",
  "medium",
  "low",
  "unmatched",
]);

export const radarFeedbackReasonEnum = pgEnum("radar_feedback_reason", [
  "too_big",
  "wrong_genre",
  "too_unknown",
  "no_fit",
  "other",
]);

/** Clubs / festivals that seed (and grow) the discovery snowball. */
export const radarVenues = pgTable(
  "radar_venues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    kind: radarVenueKindEnum("kind").notNull().default("club"),
    status: radarVenueStatusEnum("status").notNull().default("seed"),
    tier: radarVenueTierEnum("tier").notNull().default("mid"),
    city: text("city"),
    country: text("country").default("NL"),
    raUrl: text("ra_url"),
    /** Cached RA club id (digits). */
    raExternalId: text("ra_external_id"),
    websiteUrl: text("website_url"),
    /** 0–100: early-breakout curator quality. */
    venueScore: numeric("venue_score", { precision: 6, scale: 2 }),
    curatorScore: numeric("curator_score", { precision: 6, scale: 2 }),
    discoveryHops: integer("discovery_hops").notNull().default(0),
    notes: text("notes"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("radar_venues_status_idx").on(table.status),
    index("radar_venues_score_idx").on(table.venueScore),
    index("radar_venues_curator_idx").on(table.curatorScore),
    uniqueIndex("radar_venues_ra_external_uidx").on(table.raExternalId),
  ],
);

export const radarArtists = pgTable(
  "radar_artists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    status: radarArtistStatusEnum("status").notNull().default("new"),
    primaryGenre: text("primary_genre"),
    secondaryGenres: jsonb("secondary_genres").$type<string[]>().default([]),
    /** Manual overrides beat auto classification. */
    genreManual: boolean("genre_manual").notNull().default(false),
    discoverySource: radarDiscoverySourceEnum("discovery_source")
      .notNull()
      .default("manual"),
    discoveryHops: integer("discovery_hops").notNull().default(0),
    discoveredViaVenueId: uuid("discovered_via_venue_id").references(
      () => radarVenues.id,
      { onDelete: "set null" },
    ),
    /** Latest combined growth score 0–100. */
    growthScore: numeric("growth_score", { precision: 6, scale: 2 }),
    growthVelocity: numeric("growth_velocity", { precision: 8, scale: 3 }),
    growthScoreAt: timestamp("growth_score_at", { withTimezone: true }),
    growthBreakdown: jsonb("growth_breakdown").$type<Record<string, unknown>>(),
    momentumScore: numeric("momentum_score", { precision: 6, scale: 2 }),
    fitScore: numeric("fit_score", { precision: 6, scale: 2 }),
    bookabilityScore: numeric("bookability_score", { precision: 6, scale: 2 }),
    /** Top reasons in plain language (NL). */
    scoreReasons: jsonb("score_reasons").$type<string[]>().default([]),
    country: text("country"),
    city: text("city"),
    imageUrl: text("image_url"),
    notes: text("notes"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    statusChangedByUserId: uuid("status_changed_by_user_id"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("radar_artists_normalized_name_uidx").on(table.normalizedName),
    index("radar_artists_status_idx").on(table.status),
    index("radar_artists_growth_score_idx").on(table.growthScore),
    index("radar_artists_momentum_idx").on(table.momentumScore),
    index("radar_artists_primary_genre_idx").on(table.primaryGenre),
  ],
);

/** External profile ids / urls per platform (= identity layer). */
export const radarArtistProfiles = pgTable(
  "radar_artist_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => radarArtists.id, { onDelete: "cascade" }),
    platform: radarPlatformEnum("platform").notNull(),
    externalId: text("external_id"),
    url: text("url"),
    handle: text("handle"),
    matchConfidence: radarMatchConfidenceEnum("match_confidence")
      .notNull()
      .default("medium"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByUserId: uuid("confirmed_by_user_id"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("radar_artist_profiles_platform_uidx").on(
      table.artistId,
      table.platform,
    ),
    index("radar_artist_profiles_external_idx").on(
      table.platform,
      table.externalId,
    ),
  ],
);

/** Point-in-time metrics from one platform fetch. */
export const radarMetricSnapshots = pgTable(
  "radar_metric_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => radarArtists.id, { onDelete: "cascade" }),
    platform: radarPlatformEnum("platform").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** followers, monthlyListeners, plays, favorites, engagementRate, … */
    metrics: jsonb("metrics").$type<Record<string, number | string | null>>()
      .notNull()
      .default({}),
  },
  (table) => [
    index("radar_metric_snapshots_artist_captured_idx").on(
      table.artistId,
      table.capturedAt,
    ),
    index("radar_metric_snapshots_platform_captured_idx").on(
      table.platform,
      table.capturedAt,
    ),
  ],
);

export const radarGigs = pgTable(
  "radar_gigs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => radarArtists.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => radarVenues.id, {
      onDelete: "set null",
    }),
    eventName: text("event_name"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    city: text("city"),
    country: text("country"),
    source: text("source").notNull().default("resident_advisor"),
    sourceUrl: text("source_url"),
    /** RA event id (or other external). */
    externalEventId: text("external_event_id"),
    /** 0 = first billed on RA line-up. */
    billingIndex: integer("billing_index"),
    isHeadliner: boolean("is_headliner").notNull().default(false),
    attending: integer("attending"),
    announcedAt: timestamp("announced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("radar_gigs_artist_starts_idx").on(table.artistId, table.startsAt),
    index("radar_gigs_venue_starts_idx").on(table.venueId, table.startsAt),
    uniqueIndex("radar_gigs_artist_event_uidx").on(
      table.artistId,
      table.externalEventId,
    ),
  ],
);

export const radarScoreSnapshots = pgTable(
  "radar_score_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => radarArtists.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    momentum: numeric("momentum", { precision: 6, scale: 2 }).notNull(),
    fit: numeric("fit", { precision: 6, scale: 2 }).notNull(),
    bookability: numeric("bookability", { precision: 6, scale: 2 }).notNull(),
    total: numeric("total", { precision: 6, scale: 2 }).notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("radar_score_snapshots_artist_captured_idx").on(
      table.artistId,
      table.capturedAt,
    ),
  ],
);

export const radarFeedback = pgTable(
  "radar_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => radarArtists.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    fromStatus: radarArtistStatusEnum("from_status"),
    toStatus: radarArtistStatusEnum("to_status").notNull(),
    reason: radarFeedbackReasonEnum("reason"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("radar_feedback_artist_idx").on(table.artistId)],
);

export const radarAlerts = pgTable(
  "radar_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: radarAlertKindEnum("kind").notNull(),
    artistId: uuid("artist_id").references(() => radarArtists.id, {
      onDelete: "cascade",
    }),
    venueId: uuid("venue_id").references(() => radarVenues.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
  },
  (table) => [
    index("radar_alerts_kind_triggered_idx").on(table.kind, table.triggeredAt),
    index("radar_alerts_artist_idx").on(table.artistId),
  ],
);

/** Singleton-ish settings row (thresholds, digest recipients, weights). */
export const radarSettings = pgTable("radar_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedByUserId: uuid("updated_by_user_id"),
});
