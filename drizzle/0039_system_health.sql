-- System health: index cron runs per source, and remember the last
-- notified state per problem so break/recovery mails go out once.
CREATE INDEX IF NOT EXISTS "sync_jobs_source_started"
  ON "sync_jobs" ("source", "started_at");

CREATE TABLE IF NOT EXISTS "system_alerts" (
  "key" text PRIMARY KEY NOT NULL,
  "state" text NOT NULL,
  "message" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
