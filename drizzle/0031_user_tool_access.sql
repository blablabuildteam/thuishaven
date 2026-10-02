ALTER TABLE "app_users"
  ADD COLUMN IF NOT EXISTS "tool_access" jsonb
  NOT NULL
  DEFAULT '{"dashboard":true,"outreach":true,"dashboardAreas":{"overzicht":true,"omzet":true,"marketing":true},"outreachAreas":{"stappen":true,"uitleg":true}}'::jsonb;
