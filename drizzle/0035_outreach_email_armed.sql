-- Per-email arm for list-view queue (auto-send without bakje).
ALTER TABLE "outreach_emails"
  ADD COLUMN IF NOT EXISTS "armed_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "outreach_emails_armed_due_idx"
  ON "outreach_emails" ("scheduled_at")
  WHERE "status" = 'queued' AND "scheduled_at" IS NOT NULL AND "armed_at" IS NOT NULL;
