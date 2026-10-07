-- Apollo coverage / cursor state (replaces fake __apollo_cursor__ prospect).
CREATE TABLE IF NOT EXISTS "outreach_apollo_state" (
  "id" text PRIMARY KEY DEFAULT 'default',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- One-time copy from system prospect if present.
INSERT INTO "outreach_apollo_state" ("id", "metadata", "updated_at")
SELECT
  'default',
  COALESCE(p.metadata, '{}'::jsonb),
  COALESCE(p.updated_at, now())
FROM "prospects" p
WHERE p.company_name = '__apollo_cursor__'
ON CONFLICT ("id") DO NOTHING;

-- Ensure row exists even without a legacy cursor.
INSERT INTO "outreach_apollo_state" ("id", "metadata")
VALUES ('default', '{}'::jsonb)
ON CONFLICT ("id") DO NOTHING;
