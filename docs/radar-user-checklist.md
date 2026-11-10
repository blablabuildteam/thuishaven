# Radar — wat jij nog moet doen

Alles hieronder vraagt om credentials, budgetkeuze of booker-input. Bouwwerk staat in `docs/radar-next-build.md`.

1. **Spotify in Vercel** — maak een app op developer.spotify.com (BlaBlaBuild-account), zet `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` op Production. Gratis.
2. **Apify** — account onder BlaBlaBuild, zet `APIFY_TOKEN` in Vercel. Actors hoef je niet te kiezen (staan in het plan). Kost geld per run; we doen alleen de top 150 wekelijks. Niet urgent: socials-links komen nu gratis via RA.
3. **Test-digest** — Radar → Instellingen → "Test-digest naar team@". Kijk of de mail binnenkomt en klopt.
4. **Booker ±30 min** — 20–30 namen beoordelen in `/radar/artiesten` (shortlist / gepasseerd + reden). Liefst ná taak 2–4 uit het bouwplan, dan zijn de scores compleet.
5. **Digest live** — als de test goed is: booker-mails in Radar-instellingen + `RADAR_LIVE_DIGEST=true` in Vercel.
6. **Openen voor Thuishaven** — pas als jullie klaar zijn: `RADAR_PREVIEW_DOMAINS=thuishaven.nl` in Vercel.

Niet meer nodig: aparte koppeling voor Instagram/SoundCloud-handles (RA levert die).
