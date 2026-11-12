/**
 * DJ Talenten Radar — extractable module map
 *
 * Goal: later split into a standalone Vercel app without rewriting domain logic.
 * Keep all radar business logic under `src/lib/radar/*` +
 * `src/lib/integrations/{spotify,apify}` + `src/app/(tools)/radar` +
 * `src/app/api/radar` + `src/app/api/cron/radar`.
 *
 * Pipeline (cron 08:00 / 20:00 Amsterdam, force via /api/radar/sync):
 * 1. discovery     — seed/accepted venues → RA LATEST+ARCHIVE → artists + gigs
 * 2. website       — venue program pages (config selectors) → radar_parties
 * 3. instagram     — venue IG posts via Apify → parties (needs_review if weak)
 * 4. snowball      — artist pages → venue suggestions (hop 2)
 * 5. score v2      — momentum / fit / bookability + NL reasons
 * 6. social        — Apify batch IG (shortlist/watching, stale>7d) + caption gigs
 * 7. alerts        — velocity, new_on_radar, breakthrough, window_closing
 * 8. digest        — maandag Brevo-mail (test → team@ tot RADAR_LIVE_DIGEST)
 * 9. feedback      — reden bij gepasseerd → radar_feedback
 * (Spotify optioneel via ?spotify=1 — niet default voor DJ-radar)
 *
 * Manual intake: POST /api/radar/parties + UI /radar/feesten (zelfde ingest).
 *
 * Shared with the rest of Thuishaven Tools (acceptable coupling):
 * - auth / toolAccess.radar (+ @blablabuild.com preview gate)
 * - AppShell nav + system health monitors
 * - Neon Postgres (radar_* tables only)
 * - RA GraphQL client (read-only)
 * - CRON_SECRET / Apify
 *
 * Score: booking trajectory first; IG growth + labels mid-layer; Spotify later.
 * See docs/radar-plan.md.
 */
export const RADAR_MODULE = "radar" as const;
