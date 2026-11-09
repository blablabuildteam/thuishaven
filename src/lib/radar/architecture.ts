/**
 * DJ Talenten Radar — extractable module map
 *
 * Goal: later split into a standalone Vercel app without rewriting domain logic.
 * Keep all radar business logic under `src/lib/radar/*` +
 * `src/lib/integrations/{spotify,apify}` + `src/app/(tools)/radar` +
 * `src/app/api/radar` + `src/app/api/cron/radar`.
 *
 * Pipeline (cron 08:00 / 20:00 Amsterdam, force via /api/radar/sync):
 * 1. discovery  — seed/accepted venues → RA line-ups → upsert artists (max hops)
 * 2. spotify    — match/search → profiles + metric snapshots → growth score
 * 3. alerts     — velocity + new_on_radar (deduped unread)
 * 4. (later)    — Apify IG/TikTok, SoundCloud, venue snowball hop 2, Monday digest mail
 *
 * Shared with the rest of Thuishaven Tools (acceptable coupling):
 * - auth / toolAccess.radar
 * - AppShell nav
 * - Neon Postgres (radar_* tables only)
 * - RA GraphQL client (read-only)
 * - CRON_SECRET
 *
 * Score: velocityShare-weighted blend per platform; unknownCeilings boost
 * emerging acts so big names don't dominate.
 */
export const RADAR_MODULE = "radar" as const;
