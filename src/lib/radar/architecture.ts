/**
 * DJ Talenten Radar — extractable module map
 *
 * Goal: later split into a standalone Vercel app without rewriting domain logic.
 * Keep all radar business logic under `src/lib/radar/*` +
 * `src/lib/integrations/{spotify,apify}` + `src/app/(tools)/radar` +
 * `src/app/api/radar` + `src/app/api/cron/radar`.
 *
 * Pipeline (cron 08:00 / 20:00 Amsterdam, force via /api/radar/sync):
 * 1. discovery  — seed/accepted venues → RA LATEST+ARCHIVE → artists + gigs
 * 2. snowball   — artist pages → venue suggestions (hop 2)
 * 3. score v2   — momentum / fit / bookability + NL reasons
 * 4. spotify    — optional match → snapshots (bevestiging)
 * 5. alerts     — velocity + new_on_radar (later: breakthrough / window_closing)
 * 6. (later)    — Apify IG/TikTok, SoundCloud, Monday digest mail, feedback loop
 *
 * Shared with the rest of Thuishaven Tools (acceptable coupling):
 * - auth / toolAccess.radar (+ @blablabuild.com preview gate)
 * - AppShell nav
 * - Neon Postgres (radar_* tables only)
 * - RA GraphQL client (read-only)
 * - CRON_SECRET
 *
 * Score: RA booking trajectory first; social/Spotify as confirmation.
 * See docs/radar-plan.md.
 */
export const RADAR_MODULE = "radar" as const;
