-- Festivals via RA promoters + cleanup duplicate lofi
ALTER TABLE "radar_venues"
  ADD COLUMN IF NOT EXISTS "ra_promoter_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "radar_venues_ra_promoter_uidx"
  ON "radar_venues" ("ra_promoter_id");

-- Accidental duplicate without RA id
DELETE FROM "radar_venues"
WHERE lower(name) = 'lofi'
  AND ra_external_id IS NULL
  AND ra_promoter_id IS NULL;
