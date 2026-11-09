-- Radar RA backbone: venue tiers, gig billing, score v2, feedback
DO $$ BEGIN
  CREATE TYPE "public"."radar_venue_tier" AS ENUM('early', 'mid', 'major', 'festival', 'series');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."radar_match_confidence" AS ENUM('high', 'medium', 'low', 'unmatched');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."radar_feedback_reason" AS ENUM('too_big', 'wrong_genre', 'too_unknown', 'no_fit', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TYPE "public"."radar_alert_kind" ADD VALUE IF NOT EXISTS 'breakthrough';
ALTER TYPE "public"."radar_alert_kind" ADD VALUE IF NOT EXISTS 'window_closing';

ALTER TABLE "radar_venues"
  ADD COLUMN IF NOT EXISTS "tier" "radar_venue_tier" DEFAULT 'mid' NOT NULL,
  ADD COLUMN IF NOT EXISTS "ra_external_id" text,
  ADD COLUMN IF NOT EXISTS "curator_score" numeric(6, 2);

CREATE UNIQUE INDEX IF NOT EXISTS "radar_venues_ra_external_uidx"
  ON "radar_venues" ("ra_external_id");
CREATE INDEX IF NOT EXISTS "radar_venues_curator_idx"
  ON "radar_venues" ("curator_score");

ALTER TABLE "radar_artists"
  ADD COLUMN IF NOT EXISTS "momentum_score" numeric(6, 2),
  ADD COLUMN IF NOT EXISTS "fit_score" numeric(6, 2),
  ADD COLUMN IF NOT EXISTS "bookability_score" numeric(6, 2),
  ADD COLUMN IF NOT EXISTS "score_reasons" jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "radar_artists_momentum_idx"
  ON "radar_artists" ("momentum_score");

ALTER TABLE "radar_artist_profiles"
  ADD COLUMN IF NOT EXISTS "match_confidence" "radar_match_confidence" DEFAULT 'medium' NOT NULL,
  ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "confirmed_by_user_id" uuid;

ALTER TABLE "radar_gigs"
  ADD COLUMN IF NOT EXISTS "external_event_id" text,
  ADD COLUMN IF NOT EXISTS "billing_index" integer,
  ADD COLUMN IF NOT EXISTS "is_headliner" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "attending" integer;

CREATE UNIQUE INDEX IF NOT EXISTS "radar_gigs_artist_event_uidx"
  ON "radar_gigs" ("artist_id", "external_event_id");

CREATE TABLE IF NOT EXISTS "radar_score_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "artist_id" uuid NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "momentum" numeric(6, 2) NOT NULL,
  "fit" numeric(6, 2) NOT NULL,
  "bookability" numeric(6, 2) NOT NULL,
  "total" numeric(6, 2) NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "breakdown" jsonb
);
CREATE INDEX IF NOT EXISTS "radar_score_snapshots_artist_captured_idx"
  ON "radar_score_snapshots" ("artist_id", "captured_at");
DO $$ BEGIN
  ALTER TABLE "radar_score_snapshots" ADD CONSTRAINT "radar_score_snapshots_artist_id_radar_artists_id_fk"
    FOREIGN KEY ("artist_id") REFERENCES "public"."radar_artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "radar_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "artist_id" uuid NOT NULL,
  "user_id" uuid,
  "from_status" "radar_artist_status",
  "to_status" "radar_artist_status" NOT NULL,
  "reason" "radar_feedback_reason",
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "radar_feedback_artist_idx" ON "radar_feedback" ("artist_id");
DO $$ BEGIN
  ALTER TABLE "radar_feedback" ADD CONSTRAINT "radar_feedback_artist_id_radar_artists_id_fk"
    FOREIGN KEY ("artist_id") REFERENCES "public"."radar_artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
