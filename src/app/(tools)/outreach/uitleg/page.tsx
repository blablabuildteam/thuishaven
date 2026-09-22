import Link from "next/link";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasApolloConfig } from "@/lib/integrations/apollo/client";
import { hasKvkConfig } from "@/lib/integrations/kvk";
import { hasHunterConfig } from "@/lib/integrations/hunter/client";
import { getBrevoKey } from "@/lib/integrations/brevo/client";
import {
  getOutreachBrevoKey,
  getOutreachReplyTo,
  getOutreachSender,
  getOutreachTestRecipient,
  outreachLiveSendBlockReason,
  outreachTestSendBlockReason,
} from "@/lib/outreach/send-policy";
import { MAIL_CAMPAIGN_ANGLES } from "@/lib/outreach/mail-angle";

export const metadata = { title: "Hoe het werkt" };
export const dynamic = "force-dynamic";

function Conn({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-sm text-text-muted">{detail}</p>
      </div>
      <StatusBadge tone={ok ? "success" : "danger"}>
        {ok ? "Gekoppeld" : "Ontbreekt"}
      </StatusBadge>
    </li>
  );
}

const FLOW = [
  {
    n: "1",
    title: "Lijst bijwerken",
    href: "/outreach/lijst-bijwerken",
    body: "Apollo haalt mid-size bedrijven in de AMS-ring (~50 km). Daarna vullen we automatisch aan: medewerkers (Apollo), oprichtingsdatum/jubileum (KvK), contactpersonen (Apollo), e-mail (Hunter of website).",
  },
  {
    n: "2",
    title: "Bedrijven",
    href: "/outreach/crm",
    body: "Gefilterde CRM-lijst met invalshoeken (jubileum, seizoen, funding, recordjaar, algemeen). Open een dossier voor contacten, notities en geschiedenis.",
  },
  {
    n: "3",
    title: "Mailen",
    href: "/outreach/emails",
    body: "Kies bedrijf + invalshoek, genereer een draft in Reijner-toon, stuur een test naar team@. Live naar prospects staat bewust dicht.",
  },
  {
    n: "4",
    title: "Resultaten",
    href: "/outreach/analytics",
    body: "Opens/clicks komen via Brevo-webhook. Replies log je handmatig (ze landen in evenement@) — dan tellen ze mee en kunnen warme leads ontstaan.",
  },
  {
    n: "5",
    title: "Agenda (optioneel)",
    href: "/outreach/beschikbaarheid",
    body: "Selecteer dagen, kies status (open / in optie / bezet…), pas toe. Open dagen verschijnen op de publieke link in mails.",
  },
] as const;

export default function OutreachUitlegPage() {
  const apollo = hasApolloConfig();
  const kvk = hasKvkConfig();
  const hunter = hasHunterConfig();
  const brevo = Boolean(getOutreachBrevoKey() || getBrevoKey());
  const webhook = Boolean(process.env.OUTREACH_BREVO_WEBHOOK_SECRET?.trim());
  const ai = Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim(),
  );
  const liveBlock = outreachLiveSendBlockReason();
  const testBlock = outreachTestSendBlockReason();
  const sender = getOutreachSender();
  const replyTo = getOutreachReplyTo();
  const testTo = getOutreachTestRecipient();

  return (
    <div>
      <SectionHeader
        eyebrow="Demo / uitleg"
        title="Hoe het werkt"
        description="Eén pagina om de B2B-outreach door te nemen: flow, invalshoeken en koppelingen."
        action={
          <Link
            href="/outreach/lijst-bijwerken"
            className="bg-accent px-3 py-2 font-display text-sm tracking-[0.1em] text-accent-contrast"
          >
            Start bij lijst →
          </Link>
        }
      />

      <section className="mb-10">
        <h2 className="font-display text-lg tracking-[0.06em]">In één zin</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
          We vinden mid-size bedrijven rond Amsterdam, vullen KvK + contact +
          e-mail aan, kiezen een natuurlijke invalshoek (jubileum, seizoensfeest,
          deal, recordjaar), schrijven een korte mail als Reijner, en meten opens
          — eerst veilig via testsends naar team@.
        </p>
      </section>

      <section className="mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">De flow</h2>
        <ol className="mt-4 space-y-5">
          {FLOW.map((step) => (
            <li key={step.n} className="flex gap-4">
              <span className="font-display text-2xl tracking-[0.06em] text-text-dim">
                {step.n}
              </span>
              <div className="min-w-0">
                <Link
                  href={step.href}
                  className="font-medium text-text hover:text-accent"
                >
                  {step.title} →
                </Link>
                <p className="mt-1 max-w-2xl text-sm text-text-muted">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Invalshoeken voor de mail
        </h2>
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {MAIL_CAMPAIGN_ANGLES.map((a) => (
            <li key={a.id} className="py-3">
              <p className="text-sm font-medium text-text">{a.label}</p>
              <p className="text-sm text-text-muted">{a.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-text-dim">
          Jubileum en seizoen kunnen automatisch. Funding en recordjaar kies je
          zelf als de invalshoek klopt (geen nieuws-scraper).
        </p>
      </section>

      <section className="mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Koppelingen (live status)
        </h2>
        <ul className="mt-2">
          <Conn
            ok={apollo}
            label="Apollo"
            detail="Bedrijven zoeken · medewerkers · decision makers"
          />
          <Conn
            ok={kvk}
            label="KvK"
            detail="Oprichtingsdatum / jubileum · vestiging · non-mailing"
          />
          <Conn
            ok={hunter}
            label="Hunter"
            detail="E-mail bij contactpersoon (fallback: website-scrape)"
          />
          <Conn
            ok={brevo}
            label="Brevo"
            detail={`Versturen · from ${sender.email} · reply-to ${replyTo.email}`}
          />
          <Conn
            ok={webhook}
            label="Brevo webhook"
            detail="Opens, clicks en bounces → Resultaten"
          />
          <Conn
            ok={ai}
            label="AI (Gemini / OpenAI)"
            detail="Optioneel — zonder AI werken vaste templates"
          />
        </ul>
      </section>

      <section className="mb-10 border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Versturen — veilig voor demo
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-text-muted">
          <li>
            Testsend:{" "}
            {testBlock ? (
              <span className="text-danger">{testBlock}</span>
            ) : (
              <span className="text-text">
                aan → {testTo}
              </span>
            )}
          </li>
          <li>
            Live naar prospects:{" "}
            {liveBlock ? (
              <span className="text-text">{liveBlock}</span>
            ) : (
              <span className="text-accent">aan</span>
            )}
          </li>
          <li>
            Uitsluitingen (bestaande klanten / no-go’s) blokkeren draft & send.
          </li>
        </ul>
      </section>

      <section className="border-t border-border pt-8">
        <h2 className="font-display text-lg tracking-[0.06em]">
          Wat we vandaag níet doen
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>Geen live mails naar echte prospects (bewust dicht)</li>
          <li>Geen automatische reply-inbox — handmatig loggen op Resultaten</li>
          <li>Geen LinkedIn-scrape / Apify — contact via Apollo + Hunter</li>
          <li>Geen bulk auto-send vanuit de wachtrij</li>
        </ul>
        <p className="mt-6 text-sm text-text-muted">
          Technisch overzicht:{" "}
          <Link href="/outreach/pipeline" className="text-accent underline">
            Pipeline
          </Link>
          {" · "}
          <Link href="/outreach/kosten" className="text-accent underline">
            Kosten
          </Link>
        </p>
      </section>
    </div>
  );
}
