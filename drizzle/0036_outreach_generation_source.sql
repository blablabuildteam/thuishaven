-- Track whether a draft came from AI or template fallback.
ALTER TABLE "outreach_emails"
  ADD COLUMN IF NOT EXISTS "generation_source" text;
