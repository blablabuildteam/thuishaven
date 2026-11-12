-- Multi-source parties: first-class events + lineup + per-venue source config

DO $$ BEGIN
  CREATE TYPE "radar_party_source" AS ENUM (
    'ra',
    'website',
    'instagram',
    'manual'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "radar_party_status" AS ENUM (
    'published',
    'needs_review',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "radar_parties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid REFERENCES "radar_venues"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "starts_at" timestamptz,
  "source" "radar_party_source" NOT NULL DEFAULT 'manual',
  "status" "radar_party_status" NOT NULL DEFAULT 'published',
  "external_url" text,
  "external_id" text,
  "city" text,
  "country" text,
  "raw" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "radar_parties_starts_idx"
  ON "radar_parties" ("starts_at");
CREATE INDEX IF NOT EXISTS "radar_parties_venue_starts_idx"
  ON "radar_parties" ("venue_id", "starts_at");
CREATE INDEX IF NOT EXISTS "radar_parties_status_idx"
  ON "radar_parties" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "radar_parties_source_external_uidx"
  ON "radar_parties" ("source", "external_id")
  WHERE "external_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "radar_party_lineup" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "party_id" uuid NOT NULL REFERENCES "radar_parties"("id") ON DELETE CASCADE,
  "artist_id" uuid REFERENCES "radar_artists"("id") ON DELETE SET NULL,
  "raw_name" text NOT NULL,
  "billing_index" integer,
  "source" "radar_party_source" NOT NULL DEFAULT 'manual',
  "match_confidence" "radar_match_confidence" NOT NULL DEFAULT 'medium',
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "radar_party_lineup_party_idx"
  ON "radar_party_lineup" ("party_id");
CREATE INDEX IF NOT EXISTS "radar_party_lineup_artist_idx"
  ON "radar_party_lineup" ("artist_id");
CREATE UNIQUE INDEX IF NOT EXISTS "radar_party_lineup_party_raw_uidx"
  ON "radar_party_lineup" ("party_id", "raw_name");

CREATE TABLE IF NOT EXISTS "radar_venue_source_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "radar_venues"("id") ON DELETE CASCADE,
  "website_program_url" text,
  "instagram_handle" text,
  /** CSS/regex-achtige extract rules: { titlePattern, datePattern, lineupPattern, eventBlockPattern } */
  "website_selectors" jsonb DEFAULT '{}'::jsonb,
  "last_website_fetch_at" timestamptz,
  "last_instagram_fetch_at" timestamptz,
  "last_error" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "radar_venue_source_configs_venue_uidx"
  ON "radar_venue_source_configs" ("venue_id");
