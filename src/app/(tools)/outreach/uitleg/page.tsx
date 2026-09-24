import Link from "next/link";
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
import { cn } from "@/lib/utils";

export const metadata = { title: "Hoe het werkt" };
export const dynamic = "force-dynamic";

const FLOW = [
  {
    n: "01",
    title: "Lijst bijwerken",
    href: "/outreach/lijst-bijwerken",
    verb: "Ophalen & aanvullen",
    body: "Apollo haalt mid-size bedrijven in de AMS-ring. Daarna automatisch: mdw → KvK (jubileum) → contacten → e-mail.",
  },
  {
    n: "02",
    title: "Bedrijven",
    href: "/outreach/crm",
    verb: "Kiezen & filteren",
    body: "Je werklijst met invalshoeken. Open een dossier voor contacten, notities en geschiedenis.",
  },
  {
    n: "03",
    title: "Mailen",
    href: "/outreach/emails",
    verb: "Schrijven & testen",
    body: "Bedrijf + invalshoek → draft in Reijner-toon → test naar team@. Live versturen blijft dicht.",
  },
  {
    n: "04",
    title: "Resultaten",
    href: "/outreach/analytics",
    verb: "Meten & opvolgen",
    body: "Opens via Brevo. Replies log je voorlopig handmatig (evenement@) → KPIs, follow-up, warme leads.",
  },
] as const;

const CONNECTIONS = [
  {
    key: "apollo",
    label: "Apollo",
    role: "Zoeken · mdw · decision makers",
  },
  {
    key: "kvk",
    label: "KvK",
    role: "Oprichtingsdatum · jubileum · vestiging",
  },
  {
    key: "hunter",
    label: "Hunter",
    role: "E-mail bij contact (anders website)",
  },
  {
    key: "brevo",
    label: "Brevo",
    role: "Versturen + tracking",
  },
  {
    key: "webhook",
    label: "Webhook",
    role: "Opens / clicks → Resultaten",
  },
  {
    key: "ai",
    label: "AI",
    role: "Optioneel — templates werken ook",
  },
] as const;

export default function OutreachUitlegPage() {
  const status = {
    apollo: hasApolloConfig(),
    kvk: hasKvkConfig(),
    hunter: hasHunterConfig(),
    brevo: Boolean(getOutreachBrevoKey() || getBrevoKey()),
    webhook: Boolean(process.env.OUTREACH_BREVO_WEBHOOK_SECRET?.trim()),
    ai: Boolean(
      process.env.GEMINI_API_KEY?.trim() ||
        process.env.OPENAI_API_KEY?.trim() ||
        process.env.ANTHROPIC_API_KEY?.trim(),
    ),
  };
  const liveBlock = outreachLiveSendBlockReason();
  const testBlock = outreachTestSendBlockReason();
  const sender = getOutreachSender();
  const replyTo = getOutreachReplyTo();
  const testTo = getOutreachTestRecipient();
  const readyCount = Object.values(status).filter(Boolean).length;

  return (
    <div className="pb-16">
      {/* Hero */}
      <header className="relative mb-14 overflow-hidden border-b border-border pb-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-accent/10 blur-3xl dark:bg-accent/5"
        />
        <p className="text-xs font-medium tracking-[0.18em] text-text-dim uppercase">
          Bedrijfsevent outreach · demo
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.05] tracking-[0.02em] text-text sm:text-5xl lg:text-6xl">
          Lijst bijwerken → Bedrijven → Mailen → Resultaten
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">
          Mid-size bedrijven rond Amsterdam ophalen, een natuurlijke invalshoek
          kiezen, kort mailen als Reijner, opens meten — eerst veilig via
          testsends naar <code className="text-sm text-text">{testTo}</code>.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/outreach/lijst-bijwerken"
            className="bg-accent px-5 py-3 font-display text-sm tracking-[0.12em] text-accent-contrast"
          >
            Start: Lijst bijwerken →
          </Link>
          <Link
            href="/outreach/crm"
            className="border border-border px-5 py-3 font-display text-sm tracking-[0.12em] hover:border-accent"
          >
            Naar Bedrijven
          </Link>
          <Link
            href="/outreach/juridisch"
            className="border border-border px-5 py-3 font-display text-sm tracking-[0.12em] hover:border-accent"
          >
            Juridisch
          </Link>
          <StatusBadge tone={readyCount >= 4 ? "success" : "info"}>
            {readyCount}/{CONNECTIONS.length} koppelingen
          </StatusBadge>
        </div>
      </header>

      {/* Flow */}
      <section className="mb-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.16em] text-text-dim uppercase">
              Route
            </p>
            <h2 className="mt-1 font-display text-2xl tracking-[0.04em] sm:text-3xl">
              Vier stappen
            </h2>
          </div>
          <p className="hidden max-w-xs text-right text-xs text-text-dim sm:block">
            Klik een stap om die pagina te openen tijdens de demo.
          </p>
        </div>

        <ol className="stagger relative space-y-0">
          <div
            aria-hidden
            className="absolute top-3 bottom-3 left-[1.15rem] w-px bg-border sm:left-[1.4rem]"
          />
          {FLOW.map((step, i) => (
            <li key={step.n} className="relative flex gap-4 py-4 sm:gap-6">
              <span className="relative z-10 flex size-9 shrink-0 items-center justify-center border border-border bg-bg font-display text-xs tracking-[0.08em] text-text sm:size-11 sm:text-sm">
                {step.n}
              </span>
              <div className="min-w-0 flex-1 border-b border-border pb-4 sm:pb-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={step.href}
                    className="font-display text-xl tracking-[0.04em] text-text hover:text-accent sm:text-2xl"
                  >
                    {step.title}
                  </Link>
                  <span className="text-xs tracking-[0.12em] text-text-dim uppercase">
                    {step.verb}
                  </span>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-muted">
                  {step.body}
                </p>
                {i < FLOW.length - 1 ? null : (
                  <p className="mt-2 text-xs text-text-dim">Laatste stap</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Angles + safety */}
      <div className="mb-16 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <p className="text-xs tracking-[0.16em] text-text-dim uppercase">
            Inhoud
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-[0.04em] sm:text-3xl">
            Invalshoeken
          </h2>
          <p className="mt-2 max-w-md text-sm text-text-muted">
            Waarom we mailen — niet “product pitch”, maar een moment.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {MAIL_CAMPAIGN_ANGLES.map((a) => (
              <li
                key={a.id}
                className="border border-border bg-surface/60 px-4 py-4 dark:bg-surface"
              >
                <p className="font-display text-lg tracking-[0.06em] text-text">
                  {a.label}
                </p>
                <p className="mt-1.5 text-sm leading-snug text-text-muted">
                  {a.detail}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-text-dim">
            Auto: jubileum (KvK) · seizoen (kalender). Handmatig: funding ·
            recordjaar.
          </p>
        </section>

        <section className="border border-border bg-bg-elevated/80 px-5 py-6 dark:bg-surface">
          <p className="text-xs tracking-[0.16em] text-text-dim uppercase">
            Veiligheid
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-[0.04em]">
            Versturen
          </h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-text-dim">Testsend</dt>
              <dd className="mt-1 text-text">
                {testBlock ? (
                  <span className="text-danger">{testBlock}</span>
                ) : (
                  <>Aan → {testTo}</>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-text-dim">Live prospects</dt>
              <dd className="mt-1 text-text">
                {liveBlock ?? "Aan"}
              </dd>
            </div>
            <div>
              <dt className="text-text-dim">From / reply</dt>
              <dd className="mt-1 font-mono text-xs text-text-muted">
                {sender.email}
                <br />
                → {replyTo.email}
              </dd>
            </div>
          </dl>
          <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-text-dim">
            Uitsluitingen blokkeren draft & send. Geen bulk auto-send vandaag.
          </p>
        </section>
      </div>

      {/* Connections */}
      <section className="mb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.16em] text-text-dim uppercase">
              Stack
            </p>
            <h2 className="mt-1 font-display text-2xl tracking-[0.04em] sm:text-3xl">
              Koppelingen
            </h2>
          </div>
          <p className="text-sm text-text-muted">Live status op deze omgeving</p>
        </div>
        <ul className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTIONS.map((c) => {
            const ok = status[c.key];
            return (
              <li
                key={c.key}
                className="flex items-start justify-between gap-3 bg-bg px-4 py-4"
              >
                <div>
                  <p className="font-display text-lg tracking-[0.06em] text-text">
                    {c.label}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">{c.role}</p>
                </div>
                <span
                  className={cn(
                    "mt-1 size-2.5 shrink-0 rounded-full",
                    ok ? "bg-success" : "bg-danger",
                  )}
                  title={ok ? "Gekoppeld" : "Ontbreekt"}
                />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
