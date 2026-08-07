import Link from "next/link";
import { ArrowRight, BarChart3, Send } from "lucide-react";

export default function HubPage() {
  return (
    <div className="relative z-0 min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% -10%, rgba(200,245,66,0.18), transparent 50%), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(255,92,53,0.12), transparent 45%), linear-gradient(180deg, #141412 0%, #0c0c0b 55%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <header className="animate-fade-up mb-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
            blablabuild · fase 1
          </p>
          <h1 className="mt-3 font-display text-5xl tracking-tight text-text sm:text-7xl">
            THUISHAVEN
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
            Eén repo, twee tools. Marketing- & kaartverkoop naast bedrijfsevent
            outreach — gedeelde basis, klaar om te finetunen.
          </p>
        </header>

        <div className="stagger grid gap-4 sm:grid-cols-2">
          <ToolCard
            href="/dashboard"
            icon={<BarChart3 className="size-5" />}
            eyebrow="02 · 03"
            title="Marketing & Kaartverkoop"
            description="Unified dashboard: ticketverkoop per platform, marketingkanalen, creatives, TicketSwap-alerts en AI-chat."
          />
          <ToolCard
            href="/outreach"
            icon={<Send className="size-5" />}
            eyebrow="05"
            title="Bedrijfsevent Outreach"
            description="Prospectpipelines, AI-outbound via Brevo, jubileum-triggers, bureau-beschikbaarheid en lead routing."
          />
        </div>

        <p className="animate-fade-up mt-12 text-xs text-text-dim" style={{ animationDelay: "0.3s" }}>
          Draait nu op mockdata. Koppel PostgreSQL + API-keys om live te gaan.
        </p>
      </div>
    </div>
  );
}

function ToolCard({
  href,
  icon,
  eyebrow,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-sm border border-border bg-surface/80 p-6 backdrop-blur-sm transition-all hover:border-accent/40 hover:bg-surface"
    >
      <div className="mb-8 flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-sm border border-border bg-bg text-accent transition-colors group-hover:border-accent/40">
          {icon}
        </span>
        <ArrowRight className="size-4 text-text-dim transition-transform group-hover:translate-x-1 group-hover:text-accent" />
      </div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-display text-2xl tracking-tight text-text">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">{description}</p>
    </Link>
  );
}
