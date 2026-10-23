-- Exact DJ fee in whole euros, entered by hand. Replaces fee_range;
-- the old range stays as a fallback until an amount is entered.
ALTER TABLE "dj_fee_artists"
  ADD COLUMN IF NOT EXISTS "fee_amount" integer;
