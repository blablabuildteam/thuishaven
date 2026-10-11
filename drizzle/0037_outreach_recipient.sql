-- Per-mail recipient (contact at company). Falls back to prospects.email when null.
ALTER TABLE "outreach_emails"
  ADD COLUMN IF NOT EXISTS "recipient_email" text;
ALTER TABLE "outreach_emails"
  ADD COLUMN IF NOT EXISTS "recipient_name" text;
