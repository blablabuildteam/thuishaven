-- Real schedule + auto-send for outreach bakjes.
ALTER TABLE "outreach_batches"
  ADD COLUMN IF NOT EXISTS "auto_send" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "armed_at" timestamp with time zone;

ALTER TABLE "outreach_emails"
  ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "sender_email" text,
  ADD COLUMN IF NOT EXISTS "sender_profile_id" text;

CREATE INDEX IF NOT EXISTS "outreach_emails_due_send_idx"
  ON "outreach_emails" ("scheduled_at")
  WHERE "status" = 'queued' AND "scheduled_at" IS NOT NULL;
