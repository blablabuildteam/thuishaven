-- Named bakjes for reviewing outreach drafts before live send.
CREATE TYPE outreach_batch_status AS ENUM ('open', 'ready', 'sent');

CREATE TABLE IF NOT EXISTS outreach_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status outreach_batch_status NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES outreach_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS outreach_emails_batch_id_idx ON outreach_emails(batch_id);
