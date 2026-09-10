import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function HubPage() {
  return (
    <div className="relative z-0 min-h-screen overflow-hidden bg-bg">
      <div className="hub-glow pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-multiply dark:opacity-[0.2] dark:mix-blend-soft-light"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, transparent 20%, transparent 21%), repeating-conic-gradient(from 0deg at 50% -5%, transparent 0deg, rgba(0,0,0,0.03) 2deg, transparent 4deg)",
        }}
      />

      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

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
              <p className="font-display text-[11px] tracking-[0.22em] text-text-muted">
                Tools
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
              Kies waar je naartoe wilt.
            </p>
          </div>
        </header>

        <div className="stagger grid gap-3 sm:grid-cols-2">
          <ToolCard
            href="/dashboard"
            eyebrow="Dashboard"
            title="Marketing & Kaartverkoop"
            description="Ticketverkoop, marketingkanalen en alerts."
          />
          <ToolCard
            href="/outreach"
            eyebrow="Outreach"
            title="Bedrijfsevent Outreach"
            description="Agenda, bedrijven mailen en resultaten volgen."
          />
        </div>
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
      className="group relative flex flex-col border border-border bg-surface/80 p-6 backdrop-blur-sm transition-all hover:border-accent hover:bg-surface dark:bg-black/55 dark:hover:bg-black/70"
    >
      <div className="mb-8 flex items-center justify-between">
        <span className="font-display text-sm tracking-[0.18em] text-text-muted">
          {eyebrow}
        </span>
        <ArrowRight className="size-4 text-text-dim transition-transform group-hover:translate-x-1 group-hover:text-accent" />
      </div>
      <h2 className="font-display text-3xl tracking-[0.04em] text-text">
        {title}
      </h2>
      <div className="mt-3 h-px w-12 bg-highlight transition-all group-hover:w-20" />
      <p className="mt-4 text-sm leading-relaxed text-text-muted">{description}</p>
    </Link>
  );
}
