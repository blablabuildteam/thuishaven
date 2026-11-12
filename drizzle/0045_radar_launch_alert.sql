-- Alert kind for follower/social "launch" knik on the watchlist.
DO $$ BEGIN
  ALTER TYPE radar_alert_kind ADD VALUE 'launch';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
