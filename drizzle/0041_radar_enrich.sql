-- Radar enrich: RA profile fields, home gigs, settings unique, indexes, alert cleanup

ALTER TABLE "radar_artists"
  ADD COLUMN IF NOT EXISTS "ra_follower_count" integer,
  ADD COLUMN IF NOT EXISTS "resident_country" text,
  ADD COLUMN IF NOT EXISTS "booking_details" text,
  ADD COLUMN IF NOT EXISTS "has_agency" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "first_event_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "ra_enriched_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "home_gig_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "home_sell_through" numeric(6, 3);

-- Drop import rows ("eventId:artistUuid") that already have a clean eventId row
DELETE FROM "radar_gigs" g
WHERE g.external_event_id LIKE '%:%'
  AND EXISTS (
    SELECT 1
    FROM "radar_gigs" keep
    WHERE keep.artist_id = g.artist_id
      AND keep.external_event_id = split_part(g.external_event_id, ':', 1)
      AND keep.external_event_id NOT LIKE '%:%'
  );

-- Rewrite remaining import ids to plain RA event id
UPDATE "radar_gigs"
SET "external_event_id" = split_part("external_event_id", ':', 1)
WHERE "external_event_id" LIKE '%:%';

-- Keep lowest billing_index (or oldest) per (artist, event)
DELETE FROM "radar_gigs" g
USING "radar_gigs" keep
WHERE g.artist_id = keep.artist_id
  AND g.external_event_id IS NOT NULL
  AND keep.external_event_id IS NOT NULL
  AND g.external_event_id = keep.external_event_id
  AND g.id <> keep.id
  AND (
    COALESCE(g.billing_index, 999) > COALESCE(keep.billing_index, 999)
    OR (
      COALESCE(g.billing_index, 999) = COALESCE(keep.billing_index, 999)
      AND g.created_at > keep.created_at
    )
    OR (
      COALESCE(g.billing_index, 999) = COALESCE(keep.billing_index, 999)
      AND g.created_at = keep.created_at
      AND g.id::text > keep.id::text
    )
  );

-- Backfill home_gig_count from Thuishaven venue
UPDATE "radar_artists" a
SET "home_gig_count" = COALESCE(x.n, 0)
FROM (
  SELECT g.artist_id, count(*)::int AS n
  FROM "radar_gigs" g
  JOIN "radar_venues" v ON v.id = g.venue_id
  WHERE v.ra_external_id = '109027'
  GROUP BY g.artist_id
) x
WHERE a.id = x.artist_id;

CREATE INDEX IF NOT EXISTS "radar_artists_home_score_idx"
  ON "radar_artists" ("home_gig_count", "growth_score" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "radar_artists_ra_enriched_idx"
  ON "radar_artists" ("ra_enriched_at");

CREATE INDEX IF NOT EXISTS "radar_artists_ra_followers_idx"
  ON "radar_artists" ("ra_follower_count");

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "radar_artists_normalized_trgm_idx"
  ON "radar_artists" USING gin ("normalized_name" gin_trgm_ops);

-- Settings key must be unique (saveRadarSettings ON CONFLICT)
DELETE FROM "radar_settings" s
USING "radar_settings" keep
WHERE s.key = keep.key
  AND s.id <> keep.id
  AND (
    s.updated_at < keep.updated_at
    OR (s.updated_at = keep.updated_at AND s.id::text > keep.id::text)
  );

CREATE UNIQUE INDEX IF NOT EXISTS "radar_settings_key_uidx"
  ON "radar_settings" ("key");

-- Clear alert backlog once
UPDATE "radar_alerts"
SET "read_at" = now()
WHERE "read_at" IS NULL;
