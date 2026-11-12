# Radar — bouwplan volgende sprint

Uitvoerbaar door een goedkoper model. Volg de volgorde; elke taak heeft bestanden, aanpak en "klaar als".
Algemeen: Next.js 16 (lees `node_modules/next/dist/docs/` bij twijfel), Drizzle + Neon, deploy via `git push origin main` (blablabuildteam).
Na elke taak: `npx tsc --noEmit`, commit, push, check deploy met
`gh api repos/blablabuildteam/thuishaven/commits/$(git rev-parse HEAD)/status --jq .state`.

## Stand (11 nov 2026) — multi-source

- `radar_parties` / lineup / venue source configs live (migratie 0043).
- Handmatige intake + `/radar/feesten`, website-adapters, Apify IG (code), artist social gig-detectie.
- **Nog nodig in Vercel:** `SPOTIFY_CLIENT_ID`/`SECRET`, `APIFY_TOKEN` (+ optioneel actor-ids).
- Zie `docs/radar-plan.md` voor de multi-source richting.

## Stand (10 nov 2026)

- 5406 artiesten, 12344 gigs, 31 van 33 seed-venues hebben gigs. Cron draait (08:00 / 20:00).
- **Maar 325 artiesten hebben een score.** De rest is nooit gescoord.
- 289 ongelezen alerts (te veel ruis), 86 venue-suggesties die niemand beoordeelt.
- 0 Spotify-, 0 social-profielen, 0 feedback, nog geen digest verstuurd.
- Vercel production heeft `BREVO_API_KEY` en `CRON_SECRET`; geen Spotify/Apify.

## Belangrijke ontdekking: RA geeft veel gratis

RA GraphQL `artist(id)` heeft o.a.: `instagram`, `soundcloud`, `facebook`, `twitter`, `website`,
`bandcamp`, `discogs`, `followerCount`, `bookingDetails`, `residentCountry`, `area`, `firstEvent`,
`regionsMostPlayed`, `venuesMostPlayed`, `relatedArtists`, `podcasts`, `labels`, `upcomingEventsCount`.

Gevolg:
- Social **handles** krijgen we gratis via RA. Apify is alleen nog nodig voor IG/TikTok **volgersaantallen**.
- `followerCount` (RA-volgers) is een sterk, gratis groeisignaal: dagelijkse snapshot → velocity.
- `bookingDetails` → boekingsbureau herkennen → "venster sluit"-signaal.
- `residentCountry` / `area` → NL-gebaseerd = goedkoper boekbaar.
- `relatedArtists` → extra snowball-bron.
- `podcasts` → RA Podcast-optreden = mixserie-signaal.

---

## Taak 1 — RA-artiestprofiel verrijken (hoogste waarde)

**Bestanden:** `src/lib/integrations/ra/client.ts`, nieuw `src/lib/radar/ra-enrich.ts`, `src/lib/radar/pipeline.ts`, `src/lib/radar/schema.ts` + migratie `drizzle/0041_radar_enrich.sql`.

1. `getRaArtistProfile(raArtistId)` in de RA-client: query de velden hierboven
   (`podcasts { id title }`, `relatedArtists { id name contentUrl }`, `labels { id name }`, `area { name country { name } }`).
2. Schema `radar_artists` uitbreiden:
   `ra_follower_count int`, `resident_country text`, `booking_details text`, `has_agency boolean default false`,
   `first_event_at timestamptz`, `ra_enriched_at timestamptz`.
3. `enrichArtistsFromRa({ limit })`:
   - Kies artiesten met een `resident_advisor`-profiel waar `ra_enriched_at` null is of ouder dan 7 dagen, gesorteerd op gigs (meeste eerst).
   - Schrijf profielen weg via `upsertArtistProfile`: `instagram`, `soundcloud` (handle = laatste pad-segment van de URL, `matchConfidence: "high"`, want de link komt van RA zelf).
   - Website/facebook/discogs in `raw` van het RA-profiel.
   - `insertMetricSnapshot(platform "resident_advisor", { followers: followerCount, upcomingEvents })`.
   - `has_agency` = `bookingDetails` bevat een e-mailadres of woorden als `agency|booking|management|@`.
   - `relatedArtists` → `upsertRadarArtist` met `discoverySource: "snowball"`, `discoveryHops: 1` (max 5 per artiest).
   - 80 ms sleep tussen calls; elke call in try/catch.
4. Pipeline: na discovery `enrichArtistsFromRa({ limit: 150 })` in de ochtend en `limit: 250` in de avond (de avond doet geen discovery, dus er is tijd).

**Klaar als:** na 1 run hebben ≥150 artiesten `ra_enriched_at`, en het dossier toont Instagram/SoundCloud-links.

## Taak 2 — Iedereen scoren, snel (set-based)

**Probleem:** `recomputeArtistScoreV2` doet 4+ queries per artiest en laadt per artiest opnieuw de settings. Daardoor is maar 6% gescoord.

**Bestanden:** `src/lib/radar/score-v2.ts`, `src/lib/radar/pipeline.ts`.

1. Nieuwe `recomputeScoresBulk(artistIds: string[])`:
   - Laad settings één keer.
   - Eén aggregatiequery voor alle ids (`group by artist_id`) met `count(*) filter (where starts_at >= now()-90d …)` voor het recente en het vorige venster, `avg(attending)`, `avg(billing_index)`, `count(*) filter (where is_headliner)`, `count(distinct country)`, en het aantal early venues (join `radar_venues.tier = 'early'`).
   - Top-venues per artiest met een tweede query (`row_number() over (partition by artist_id order by count desc)`), max 3.
   - Laatste Spotify-snapshot en RA-followers in één query (`distinct on (artist_id, platform)`).
   - Hergebruik `computeScoreV2` (pure functie) per artiest; schrijf updates in batches van 100.
   - Score-snapshots alleen bij een verschil > 2 punten met de vorige score (scheelt rijen).
2. Voeg RA-volgers toe aan `computeScoreV2`:
   - Momentum: groei van RA-volgers over 30 dagen (uit snapshots), gewicht ±0.2.
   - Bookability: `ra_follower_count` > 15k → penalty; `has_agency` → −15.
   - Fit: `resident_country = 'Netherlands'` → +10.
   - Reden-teksten: "RA-volgers +18% in 30 dagen", "Woont in NL", "Heeft boekingsbureau — venster sluit".
3. Pipeline-stap "rescore": artiesten met `growth_score_at` null of ouder dan 24 uur, max 1500 per run.
4. Eenmalig script `scripts/radar-rescore-all.ts`.

**Klaar als:** alle ~5400 artiesten hebben een score; de rescore-stap duurt < 60 s voor 1500 artiesten.

## Taak 3 — Thuishaven-gigs dedupen + "Al geboekt"-vlag

**Probleem:** het import-script gebruikte `externalEventId = "${raEventId}:${artistId}"`, terwijl discovery `event.id` gebruikt. Daardoor staan Thuishaven-events dubbel.

1. Migratie/script: zet `external_event_id` terug naar het deel vóór `:`, en verwijder daarna de duplicaten per `(artist_id, external_event_id)` (houd de rij met de laagste `billing_index`).
2. Repareer `scripts/import-thuishaven-ra-listings.ts`: gebruik `listing.raEventId`.
3. Nieuw veld `home_gig_count int default 0` op `radar_artists`, gevuld door de rescore: het aantal gigs bij de venue met `ra_external_id = '109027'`.
4. In de lijst: badge "Al bij Thuishaven (3×)". Standaardfilter **"Nieuw voor Thuishaven"** (`home_gig_count = 0`), met een toggle om iedereen te tonen.
5. Wie vaak bij Thuishaven stond, is een **fit-anker**, geen ontdekking. Fit-score voor anderen: +punten als ze ≥2 gigs delen met artiesten die bij Thuishaven stonden (gedeelde venues of events). Eenvoudige versie: overlap van top-venues.

**Klaar als:** geen dubbele Thuishaven-gigs, en de standaardlijst toont alleen artiesten die nog niet bij Thuishaven speelden.

## Taak 4 — Artiestenlijst echt bruikbaar

**Probleem:** de lijst laadt 50 rijen en filtert alleen client-side; je kunt dus niet zoeken in 5400 artiesten.

**Bestanden:** `src/app/(tools)/radar/artiesten/page.tsx`, `src/components/radar/artists-workbench.tsx`, `src/lib/radar/artists.ts`.

1. Filters via `searchParams` (Next 16: `searchParams` is een Promise): `q`, `status`, `land`, `nieuw` (default 1), `sort` (`score|momentum|bookability|ra_followers|newest`), `page`.
2. Server-side zoeken en pagineren (50 per pagina, vorige/volgende). Updates via `router.replace` met debounce van 300 ms op het zoekveld.
3. Kolommen: Score, Momentum, Bookable, Gigs 90d, RA-volgers, Laatste gig, Land, Status. Redenen onder de naam (al aanwezig).
4. Mobiel: kaarten (`md:hidden`) + tabel (`hidden md:block`), zoals elders in de app.
5. Indexen: `radar_artists (home_gig_count, growth_score desc)`, plus `pg_trgm` op `normalized_name` (`create extension if not exists pg_trgm; create index … using gin (normalized_name gin_trgm_ops)`).

**Klaar als:** zoeken op naam vindt elke artiest binnen 300 ms, en de filters staan in de URL.

## Taak 5 — Ruis eruit: alerts en venue-suggesties

1. **Alerts**
   - Alleen voor artiesten met `home_gig_count = 0`, score ≥ `newOnRadarMinScore` en status niet in `passed|not_relevant|booked`.
   - Max 15 nieuwe alerts per run (sorteer op score).
   - Knop "Alles gelezen" (`PATCH /api/radar/alerts { all: true }`) en een filter per soort.
   - Eenmalig: markeer de huidige 289 als gelezen.
2. **Venue-suggesties**
   - `venue_score` = aantal verschillende Radar-artiesten met een gig daar × (aandeel artiesten met score ≥ 50).
   - Auto-afwijzen als de gemiddelde attending > 1500 (festival/major) of als er < 2 radar-artiesten spelen.
   - Sorteer suggesties op `venue_score`, met bulk-acties: "Top 5 accepteren", "Rest afwijzen".
   - Tier voor nieuwe venues: `early` als de gemiddelde attending < 300, anders `mid`.

**Klaar als:** < 30 open alerts per dag, en suggesties zijn gesorteerd met een score.

## Taak 6 — Spotify (zodra de keys in Vercel staan)

Code bestaat al (`src/lib/radar/spotify-sync.ts`). Aanscherpen:
- Matchen alleen als de genormaliseerde naam exact overeenkomt **en** de genres electronic/house/techno/dance bevatten → `high`; anders `low` (niet meenemen in de score).
- Dossier: knoppen "Klopt" (→ `confirmed_at`) en "Verkeerde artiest" (profiel verwijderen + `unmatched` onthouden zodat we niet opnieuw matchen).
- Alleen voor artiesten met score ≥ 40, max 150 per run (rate limit).

## Taak 7 — Apify-volgers (zodra de token er is)

Handles komen nu uit taak 1, dus Apify hoeft alleen nog getallen op te halen.
- `src/lib/integrations/apify/client.ts`: `runActorSync(actorId, input)` via
  `POST https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items?token=…`.
  **Let op:** voeg in `src/lib/integrations/read-only.ts` een allowance toe voor deze URL (de read-only guard blokkeert POST).
- Instagram: actor `apify/instagram-profile-scraper`, input `{ usernames: [...] }` in **batches van 50** (één run per batch = goedkoper). Velden: `followersCount`, `postsCount`, `biography` (bio → `has_agency` aanvullen).
- TikTok: `clockworks/tiktok-profile-scraper`, input `{ profiles: [...] }`, velden `authorMeta.fans`, `authorMeta.heart`.
- Gelaagd: top 150 op score wekelijks, de rest nooit (kosten). Snapshots → velocity in de score (Instagram-gewicht pas meetellen bij ≥2 snapshots).

## Taak 8 — Digest checken en ticketlift-signaal

1. De digest is nog nooit verstuurd. Test via Radar → Instellingen → "Test-digest naar team@" (Brevo-key staat in Vercel). Fix eventuele fouten; kijk of de links naar `/radar/artiesten/[id]` werken.
2. Digest-inhoud: alleen artiesten die "nieuw voor Thuishaven" zijn; voeg de sectie "Venues om te beoordelen (top 3)" toe.
3. **Ticketlift (Thuishaven-specifiek):** `ra_listings.edition_id` → `ticket_inventory.sold` / capaciteit per editie. Per artiest met `home_gig_count > 0`: gemiddelde verkoop-% van hun edities → `home_sell_through numeric`. Toon dit in het dossier ("Gem. 94% verkocht bij Thuishaven").
   Later: als fit-signaal voor lookalikes (artiesten die dezelfde venues/related artists delen met goede verkopers).

## Taak 9 — Robuustheid

- **Bug:** `saveRadarSettings` in `src/lib/radar/settings.ts` gebruikt `onConflictDoUpdate` op `key`, maar `radar_settings.key` heeft in de DB geen unique constraint, dus opslaan in Instellingen faalt.
  Fix: migratie die eerst de duplicaten per key verwijdert (houd de nieuwste `updated_at`) en dan `create unique index if not exists radar_settings_key_uq on radar_settings(key)`. Zet `.unique()` in het schema. Dan kan `rotation.ts` ook terug naar upsert.
- `withRetry(fn, { tries: 3, backoffMs: 500 })` rond RA-fetches en de upserts in discovery/enrich: de lokale batch brak af op een DB `ECONNRESET`.
- Tijdsbudget in de cron: stop nieuwe stappen na 240 s (`deadline = start + 240_000`), en log wat is overgeslagen in `notes`.
- Log een samenvatting per run met `logIntegration({ source: "radar", … })` zodat het in de logs zichtbaar is.

---

## Volgorde en grootte

| # | Taak | Grootte | Afhankelijk van |
|---|------|---------|-----------------|
| 1 | RA-profiel verrijken | M | — |
| 2 | Bulk-scoring | M | 1 (voor RA-volgers; kan ook zonder) |
| 3 | Dedupe + "Al geboekt" | S | — |
| 4 | Lijst met filters/zoeken | M | 2, 3 |
| 5 | Ruis eruit | S | 2, 3 |
| 9 | Robuustheid | S | — |
| 8 | Digest + ticketlift | S/M | 3 |
| 6 | Spotify | S | Spotify-keys |
| 7 | Apify | M | Apify-token, 1 |

Taken 1, 3 en 9 kunnen parallel. Taken 6 en 7 pas als de keys er zijn.
