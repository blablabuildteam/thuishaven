DO $$ BEGIN
  ALTER TYPE radar_alert_kind ADD VALUE 'label_watch';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
