import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";

export default function HubPage() {
  return (
    <div className="relative z-0 min-h-screen overflow-hidden bg-bg">
      <div
        className="animate-fire pointer-events-none absolute inset-0 opacity-90"
        style={{
          background: `
            radial-gradient(ellipse 70% 55% at 15% 0%, rgba(255,90,31,0.45), transparent 55%),
            radial-gradient(ellipse 50% 40% at 85% 10%, rgba(196,30,18,0.35), transparent 50%),
            linear-gradient(180deg, #1a0505 0%, #000000 58%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <header className="animate-fade-up mb-12">
          <div className="mb-8 flex items-center gap-4">
            <Image
              src="/brand/logo-mark.png"
              alt="Thuishaven"
              width={72}
              height={72}
              className="object-contain"
              priority
            />
            <div>
              <p className="font-display text-[11px] tracking-[0.22em] text-accent">
                Tools · Fase 1
              </p>
              <BrandLogo
                href={undefined}
                showMark={false}
                wordmarkClassName="text-5xl sm:text-7xl"
              />
            </div>
          </div>

          <div className="rule-yellow max-w-xl pb-4">
            <p className="max-w-xl text-sm leading-relaxed text-text-muted sm:text-base">
              Marketing- & kaartverkoop naast bedrijfsevent outreach — één
              huisstijl, één repo, klaar om te finetunen.
            </p>
          </div>
        </header>

        <div className="stagger grid gap-3 sm:grid-cols-2">
          <ToolCard
            href="/dashboard"
            eyebrow="02 · 03"
            title="Marketing & Kaartverkoop"
            description="Unified dashboard: ticketverkoop per platform, marketingkanalen, creatives, TicketSwap-alerts en AI-chat."
          />
          <ToolCard
            href="/outreach"
            eyebrow="05"
            title="Bedrijfsevent Outreach"
            description="Prospectpipelines, AI-outbound via Brevo, jubileum-triggers, bureau-beschikbaarheid en lead routing."
          />
        </div>

        <p
          className="animate-fade-up mt-10 font-display text-sm tracking-[0.14em] text-text-dim"
          style={{ animationDelay: "0.35s" }}
        >
          Mockdata · Live koppelingen volgen
        </p>
      </div>
    </div>
  );
}

function ToolCard({
  href,
  eyebrow,
  title,
  description,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col border border-border bg-black/55 p-6 backdrop-blur-sm transition-all hover:border-accent hover:bg-black/70"
    >
      <div className="mb-8 flex items-center justify-between">
        <span className="font-display text-sm tracking-[0.18em] text-accent">
          {eyebrow}
        </span>
        <ArrowRight className="size-4 text-text-dim transition-transform group-hover:translate-x-1 group-hover:text-accent" />
      </div>
      <h2 className="font-display text-3xl tracking-[0.04em] text-text">
        {title}
      </h2>
      <div className="mt-3 h-px w-12 bg-accent transition-all group-hover:w-20" />
      <p className="mt-4 text-sm leading-relaxed text-text-muted">{description}</p>
    </Link>
  );
}
