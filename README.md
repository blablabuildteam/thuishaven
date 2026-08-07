# Thuishaven Tools

Eén Next.js-repo voor twee producten uit de blablabuild-plannen (augustus 2026):

1. **Marketing- & Kaartverkoop Dashboard** (`/dashboard`) — project 02 + 03  
2. **Bedrijfsevent Outreach** (`/outreach`) — project 05  

Beide delen design system, database-schema en later auth. De UI draait op **mockdata** zodat je meteen kunt finetunen zonder API-keys.

## Starten

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structuur

```
src/
  app/
    page.tsx                 → hub (kies tool)
    (tools)/dashboard/...    → marketing + tickets + AI chat + alerts
    (tools)/outreach/...     → prospects, campagnes, e-mails, leads
  components/                → shell + UI + charts
  lib/
    db/schema.ts             → PostgreSQL schema (Drizzle)
    mock/                    → realististische seed-data
    integrations/            → stubs voor Weeztix, Brevo, KvK, social, …
```

## Database (optioneel nu)

```bash
cp .env.example .env.local
# vul DATABASE_URL
npm run db:generate
npm run db:push
```

Zonder `DATABASE_URL` blijft alles op mockdata werken.

## Wat jij nog moet aanleveren

Zie de checklist in de chat / projectplannen. Kort:

**Beide tools**
- Brevo API-key + verzenddomein (SPF/DKIM)
- AI-key (OpenAI of Anthropic)

**Dashboard**
- API-toegang: Instagram, TikTok, YouTube, Weeztix, TicketSwap, Resident Advisor, Appic
- Intern ticketbeheersysteem (URL + docs + key)
- Editie-namen mapping over systemen
- Alert-e-mailadressen
- Voorbeeld-creatives per editie

**Outreach**
- KvK API-credentials
- Lijst event management bureaus
- Open/beschikbare data (formaat + updatefrequentie)
- Tone-of-voice voorbeelden
- Sales-notificatie e-mail
- Uitsluitingslijst (klanten / no-go)
- Goedkeuring targeting (500–5.000 medewerkers, Amsterdam + 50 km)

## Scripts

| Command | Doel |
|---------|------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:generate` | Drizzle migrations genereren |
| `npm run db:push` | Schema naar Postgres pushen |
| `npm run db:studio` | Drizzle Studio |

## Fase-plan (zoals in de offertes)

- **Nu:** foundation + UI shells + schema + integration stubs  
- **Volgende:** echte sync-pipelines, auth, Brevo send/webhooks, AI prompts  
- **Daarna:** visual recognition, TicketSwap-alerting live, testcampagnes
