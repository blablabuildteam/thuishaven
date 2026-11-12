# DJ Talenten Radar — plan (multi-source)

Preview blijft `@blablabuild.com`-only tot we openzetten.

## Richting

RA is **één** bron, niet de enige. Hart: **venues → feesten → line-ups → talent volgen → socials/Spotify als bevestiging**.

Bronnen:

1. Resident Advisor (clubs + promoters/festivals)
2. Club-/festivalwebsites (programmapagina’s, config-selectors)
3. Instagram van venues (Apify posts → party-kandidaten)
4. Handmatige line-up paste / link (`/radar/feesten`)

Alles landt in `radar_parties` + `radar_party_lineup` (+ gigs voor scoring).

## Signalen (sterk → ondersteunend)

1. Booking trajectory (gigs 90d vs vorige 90d, venue-niveau, internationalisering, billing-index) — alle bronnen
2. Curator-venues (early-signal clubs met hoge curator-score)
3. Mixseries / bekende platforms (later: Boiler Room, HÖR, NTS, …)
4. Line-up met grotere namen
5. Social velocity (IG/TikTok/SC) — bevestiging + gig-detectie in captions
6. Window closing (bureau in bio, headline-sprong, follower-sprong)
7. Thuishaven-fit (eigen line-ups + later ticketlift)

## Score = 3 deelscores + redenen

- **Momentum** — groeit de boekingscurve?
- **Fit** — past bij early venues / NL-regio / genre
- **Bookability** — nog niet te groot

## Fases

| Fase | Wat | Status |
|------|-----|--------|
| 0–1 | RA backbone, scores, enrich | live |
| 1b | Parties-schema + handmatige intake + Feesten-UI | live |
| 2a | Website adapters + venue source configs | live |
| 2b | Apify IG venues + review-queue | live (needs APIFY_TOKEN) |
| 2c | Artist social batch (shortlist/watching, stale>7d) + gig-captions | live (APIFY_TOKEN) |
| 2d | Dossier: social Δ + labels + aankomende gigs | live |
| 3 | Spotify | bewust bewust uit (te laat voor DJ-radar); `?spotify=1` |
| 4 | Digest + alerts polish | deels |
| 5 | Mixseries-watchlist + label-alerts | open |
| 6 | Booker-feedback → gewichten + ticketlift | open |

## Extractability

Alles onder `src/lib/radar/*`, `src/app/(tools)/radar`, `src/app/api/radar`, `src/app/api/cron/radar`, `radar_*` tabellen. Geen harde FK naar `app_users`.
