# DJ Talenten Radar — plan (RA-first)

Preview blijft `@blablabuild.com`-only tot we openzetten.

## Waarom RA eerst

Spotify zegt weinig over opkomende DJ’s. Doorbraak zie je eerder aan **waar** en **met wie** iemand speelt. RA heeft historie; socials bevestigen later.

## Signalen (sterk → ondersteunend)

1. Booking trajectory (gigs 90d vs vorige 90d, venue-niveau, internationalisering, billing-index)
2. Curator-venues (early-signal clubs met hoge curator-score)
3. Mixseries / bekende platforms (later: Boiler Room, HÖR, NTS, …)
4. Line-up met grotere namen
5. Social velocity (IG/TikTok/SC) — bevestiging, niet hoofdsignaal
6. Window closing (bureau in bio, headline-sprong, follower-sprong)
7. Thuishaven-fit (eigen line-ups + later ticketlift)

## Score = 3 deelscores + redenen

- **Momentum** — groeit de boekingscurve?
- **Fit** — past bij early venues / NL-regio / genre
- **Bookability** — nog niet te groot

Ranglijst combineert die drie. UI toont max 3 redenen in gewone taal.

## Fases

| Fase | Wat | Status |
|------|-----|--------|
| 0 | Spotify keys, seed venues, cron, RA history pull | in bouw |
| 1 | RA backbone: gigs+billing, identities/profiles, venue tier/curator, snowball hop 2 | in bouw |
| 2 | Apify IG/TikTok + SoundCloud, layered refresh | open |
| 3 | Score v2 + score snapshots + backtest | in bouw (v2 basis) |
| 4 | Maandag-digest + breakthrough / window-closing alerts | open |
| 5 | Booker-feedback → gewichten + ticketlift-koppeling | open |

## Extractability

Alles onder `src/lib/radar/*`, `src/app/(tools)/radar`, `src/app/api/radar`, `src/app/api/cron/radar`, `radar_*` tabellen. Geen harde FK naar `app_users`.
