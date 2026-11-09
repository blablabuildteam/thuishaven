-- DJ Talenten Radar foundation (extractable radar_* tables)
CREATE TYPE "public"."radar_artist_status" AS ENUM('new', 'watching', 'shortlist', 'contacted', 'booked', 'passed', 'not_relevant');
CREATE TYPE "public"."radar_venue_kind" AS ENUM('club', 'festival', 'other');
CREATE TYPE "public"."radar_venue_status" AS ENUM('seed', 'suggested', 'accepted', 'rejected');
CREATE TYPE "public"."radar_platform" AS ENUM('spotify', 'instagram', 'tiktok', 'soundcloud', 'resident_advisor');
CREATE TYPE "public"."radar_discovery_source" AS ENUM('seed', 'lineup', 'snowball', 'label', 'manual', 'spotify', 'support');
CREATE TYPE "public"."radar_alert_kind" AS ENUM('velocity', 'new_on_radar', 'venue_suggestion', 'lineup', 'digest');

CREATE TABLE IF NOT EXISTS "radar_venues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "kind" "radar_venue_kind" DEFAULT 'club' NOT NULL,
  "status" "radar_venue_status" DEFAULT 'seed' NOT NULL,
  "city" text,
  "country" text DEFAULT 'NL',
  "ra_url" text,
  "website_url" text,
  "venue_score" numeric(6, 2),
  "discovery_hops" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "accepted_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "radar_venues_status_idx" ON "radar_venues" ("status");
CREATE INDEX IF NOT EXISTS "radar_venues_score_idx" ON "radar_venues" ("venue_score");

CREATE TABLE IF NOT EXISTS "radar_artists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "status" "radar_artist_status" DEFAULT 'new' NOT NULL,
  "primary_genre" text,
  "secondary_genres" jsonb DEFAULT '[]'::jsonb,
  "genre_manual" boolean DEFAULT false NOT NULL,
  "discovery_source" "radar_discovery_source" DEFAULT 'manual' NOT NULL,
  "discovery_hops" integer DEFAULT 0 NOT NULL,
  "discovered_via_venue_id" uuid,
  "growth_score" numeric(6, 2),
  "growth_velocity" numeric(8, 3),
  "growth_score_at" timestamp with time zone,
  "growth_breakdown" jsonb,
  "country" text,
  "city" text,
  "image_url" text,
  "notes" text,
  "status_changed_at" timestamp with time zone,
  "status_changed_by_user_id" uuid,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "radar_artists_normalized_name_uidx" ON "radar_artists" ("normalized_name");
CREATE INDEX IF NOT EXISTS "radar_artists_status_idx" ON "radar_artists" ("status");
CREATE INDEX IF NOT EXISTS "radar_artists_growth_score_idx" ON "radar_artists" ("growth_score");
CREATE INDEX IF NOT EXISTS "radar_artists_primary_genre_idx" ON "radar_artists" ("primary_genre");
DO $$ BEGIN
  ALTER TABLE "radar_artists" ADD CONSTRAINT "radar_artists_discovered_via_venue_id_radar_venues_id_fk"
    FOREIGN KEY ("discovered_via_venue_id") REFERENCES "public"."radar_venues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "radar_artist_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "artist_id" uuid NOT NULL,
  "platform" "radar_platform" NOT NULL,
  "external_id" text,
  "url" text,
  "handle" text,
  "raw" jsonb,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "radar_artist_profiles_platform_uidx" ON "radar_artist_profiles" ("artist_id", "platform");
CREATE INDEX IF NOT EXISTS "radar_artist_profiles_external_idx" ON "radar_artist_profiles" ("platform", "external_id");
DO $$ BEGIN
  ALTER TABLE "radar_artist_profiles" ADD CONSTRAINT "radar_artist_profiles_artist_id_radar_artists_id_fk"
    FOREIGN KEY ("artist_id") REFERENCES "public"."radar_artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "radar_metric_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "artist_id" uuid NOT NULL,
  "platform" "radar_platform" NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "radar_metric_snapshots_artist_captured_idx" ON "radar_metric_snapshots" ("artist_id", "captured_at");
CREATE INDEX IF NOT EXISTS "radar_metric_snapshots_platform_captured_idx" ON "radar_metric_snapshots" ("platform", "captured_at");
DO $$ BEGIN
  ALTER TABLE "radar_metric_snapshots" ADD CONSTRAINT "radar_metric_snapshots_artist_id_radar_artists_id_fk"
    FOREIGN KEY ("artist_id") REFERENCES "public"."radar_artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "radar_gigs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "artist_id" uuid NOT NULL,
  "venue_id" uuid,
  "event_name" text,
  "starts_at" timestamp with time zone,
  "city" text,
  "country" text,
  "source" text DEFAULT 'resident_advisor' NOT NULL,
  "source_url" text,
  "announced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "radar_gigs_artist_starts_idx" ON "radar_gigs" ("artist_id", "starts_at");
CREATE INDEX IF NOT EXISTS "radar_gigs_venue_starts_idx" ON "radar_gigs" ("venue_id", "starts_at");
DO $$ BEGIN
  ALTER TABLE "radar_gigs" ADD CONSTRAINT "radar_gigs_artist_id_radar_artists_id_fk"
    FOREIGN KEY ("artist_id") REFERENCES "public"."radar_artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "radar_gigs" ADD CONSTRAINT "radar_gigs_venue_id_radar_venues_id_fk"
    FOREIGN KEY ("venue_id") REFERENCES "public"."radar_venues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "radar_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "radar_alert_kind" NOT NULL,
  "artist_id" uuid,
  "venue_id" uuid,
  "title" text NOT NULL,
  "body" text,
  "payload" jsonb,
  "triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "read_at" timestamp with time zone,
  "emailed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "radar_alerts_kind_triggered_idx" ON "radar_alerts" ("kind", "triggered_at");
CREATE INDEX IF NOT EXISTS "radar_alerts_artist_idx" ON "radar_alerts" ("artist_id");
DO $$ BEGIN
  ALTER TABLE "radar_alerts" ADD CONSTRAINT "radar_alerts_artist_id_radar_artists_id_fk"
    FOREIGN KEY ("artist_id") REFERENCES "public"."radar_artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "radar_alerts" ADD CONSTRAINT "radar_alerts_venue_id_radar_venues_id_fk"
    FOREIGN KEY ("venue_id") REFERENCES "public"."radar_venues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "radar_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "value" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by_user_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "radar_settings_key_uidx" ON "radar_settings" ("key");
