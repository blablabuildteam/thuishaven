# Radar — wat jij nog moet doen

Alles hieronder vraagt om credentials, budgetkeuze of booker-input. De rest is gebouwd.

1. **Spotify in Vercel** — zet `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` (Client Credentials) op Production. Zonder dit geen Spotify-bevestiging naast RA.
2. **Apify** — maak/kies Instagram + TikTok actors op het BlaBlaBuild/Thuishaven-account, zet `APIFY_TOKEN` (+ optioneel `APIFY_INSTAGRAM_ACTOR_ID` / `APIFY_TIKTOK_ACTOR_ID`).
3. **Booker-kalibratie (±30 min)** — 20–30 namen beoordelen in `/radar/artiesten` (shortlist / gepasseerd + reden). Daarmee stellen we gewichten scherp.
4. **Digest live** — test-digest gaat nu naar `team@blablabuild.com`. Als dat goed is: booker-mails in Radar-instellingen + `RADAR_LIVE_DIGEST=true` in Vercel.
5. **Openen voor Thuishaven** — pas als jullie klaar zijn: `RADAR_PREVIEW_DOMAINS` uitbreiden of preview-gate uitzetten.

Optioneel: maandelijkse luisteraars via scraper (Spotify API geeft die niet).
