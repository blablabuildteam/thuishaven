-- DJ fees synced daily from the client's Google Sheet. A row with
-- sheet_synced_at set takes its fee from the sheet and is read-only in the
-- dashboard; sheet_note keeps the sheet's Soort Fee / Bijzonderheid / notes.
ALTER TABLE "dj_fee_artists"
  ADD COLUMN IF NOT EXISTS "sheet_synced_at" timestamp with time zone;
ALTER TABLE "dj_fee_artists"
  ADD COLUMN IF NOT EXISTS "sheet_note" text;
