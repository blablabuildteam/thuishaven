-- Mixseries / YouTube + NL audience for Radar
ALTER TYPE "radar_platform" ADD VALUE IF NOT EXISTS 'youtube';
ALTER TYPE "radar_alert_kind" ADD VALUE IF NOT EXISTS 'mixseries';

ALTER TABLE "radar_artists"
  ADD COLUMN IF NOT EXISTS "nl_audience_score" numeric(6, 2),
  ADD COLUMN IF NOT EXISTS "nl_gig_share" numeric(6, 3),
  ADD COLUMN IF NOT EXISTS "regions_most_played" jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "radar_mixseries_appearances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "artist_id" uuid REFERENCES "radar_artists"("id") ON DELETE SET NULL,
  "channel_key" text NOT NULL,
  "channel_title" text,
  "platform" text NOT NULL DEFAULT 'youtube',
  "external_id" text NOT NULL,
  "title" text NOT NULL,
  "url" text,
  "published_at" timestamptz,
  "view_count" integer,
  "like_count" integer,
  "matched_name" text,
  "raw" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "radar_mixseries_platform_external_uidx"
  ON "radar_mixseries_appearances" ("platform", "external_id");
CREATE INDEX IF NOT EXISTS "radar_mixseries_artist_idx"
  ON "radar_mixseries_appearances" ("artist_id");
CREATE INDEX IF NOT EXISTS "radar_mixseries_views_idx"
  ON "radar_mixseries_appearances" ("view_count");
