-- Per-batch sender (Evenementen / Reiner / Yoram).
ALTER TABLE "outreach_batches"
  ADD COLUMN IF NOT EXISTS "sender_profile_id" text NOT NULL DEFAULT 'reiner',
  ADD COLUMN IF NOT EXISTS "sender_email" text NOT NULL DEFAULT 'reiner@thuishaven.nl',
  ADD COLUMN IF NOT EXISTS "sender_name" text NOT NULL DEFAULT 'Reiner · Thuishaven',
  ADD COLUMN IF NOT EXISTS "reply_to_email" text NOT NULL DEFAULT 'reiner@thuishaven.nl',
  ADD COLUMN IF NOT EXISTS "reply_to_name" text NOT NULL DEFAULT 'Reiner · Thuishaven';

-- Widen default allowlist so the three profiles are accepted out of the box.
UPDATE "outreach_settings"
SET "allowed_sender_emails" = 'evenementen@thuishaven.nl,reiner@thuishaven.nl,yoram@thuishaven.nl,zakelijk@thuishaven.nl,evenement@thuishaven.nl'
WHERE "id" = 'default'
  AND (
    "allowed_sender_emails" IS NULL
    OR "allowed_sender_emails" = ''
    OR "allowed_sender_emails" = 'zakelijk@thuishaven.nl,evenement@thuishaven.nl'
  );
