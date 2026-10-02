-- Outreach settings (afzender, reply-to, cadence) + optional planned start on batches.
CREATE TABLE IF NOT EXISTS outreach_settings (
  id text PRIMARY KEY DEFAULT 'default',
  sender_email text NOT NULL DEFAULT 'zakelijk@thuishaven.nl',
  sender_name text NOT NULL DEFAULT 'Reijner · Thuishaven',
  reply_to_email text NOT NULL DEFAULT 'evenement@thuishaven.nl',
  reply_to_name text NOT NULL DEFAULT 'Yoram & Reijner',
  allowed_sender_emails text NOT NULL DEFAULT 'zakelijk@thuishaven.nl,evenement@thuishaven.nl',
  test_recipient text NOT NULL DEFAULT 'team@blablabuild.com',
  send_weekdays jsonb NOT NULL DEFAULT '[2, 4]'::jsonb,
  mails_per_day integer NOT NULL DEFAULT 3,
  preferred_hour integer NOT NULL DEFAULT 10,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO outreach_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE outreach_batches
  ADD COLUMN IF NOT EXISTS planned_start_day text;
