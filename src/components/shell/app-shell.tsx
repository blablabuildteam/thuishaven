"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CloudSun,
  Home,
  LayoutDashboard,
  Layers,
  MessageSquare,
  Plug,
  Send,
  Ticket,
  Users,
  Sparkles,
  Mail,
  LineChart,
  Workflow,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/auth/user-menu";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const dashboardNav: NavItem[] = [
  { href: "/dashboard", label: "Overzicht", icon: LayoutDashboard },
  { href: "/dashboard/tickets", label: "Kaartverkoop", icon: Ticket },
  { href: "/dashboard/marketing", label: "Marketing", icon: BarChart3 },
  { href: "/dashboard/edities", label: "Edities", icon: Layers },
  { href: "/dashboard/insights", label: "Insights", icon: MessageSquare },
  { href: "/dashboard/weeztix", label: "Weeztix", icon: Ticket },
  { href: "/dashboard/context", label: "Weer", icon: CloudSun },
  { href: "/koppelingen", label: "Koppelingen", icon: Plug },
];

const outreachNav: NavItem[] = [
  { href: "/outreach", label: "Overzicht", icon: Send },
  { href: "/outreach/prospects", label: "Prospects", icon: Users },
  { href: "/outreach/campaigns", label: "Campagnes", icon: Sparkles },
  { href: "/outreach/emails", label: "E-mails", icon: Mail },
  { href: "/outreach/analytics", label: "Wat werkt", icon: LineChart },
  { href: "/outreach/pipeline", label: "Pipeline", icon: Workflow },
  { href: "/koppelingen", label: "Koppelingen", icon: Plug },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOutreach = pathname.startsWith("/outreach");
  const nav = isOutreach ? outreachNav : dashboardNav;
  const toolLabel = isOutreach
    ? "Outreach"
    : pathname.startsWith("/koppelingen")
      ? "Koppelingen"
      : "Dashboard";

  return (
    <div className="relative z-0 flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-bg lg:flex">
        <div className="border-b border-border px-4 py-4">
          <Link href="/" className="group flex items-center gap-3">
            <Image
              src="/brand/logo-mark.png"
              alt=""
              width={36}
              height={36}
              className="object-contain"
              priority
            />
            <div>
              <p className="font-display text-lg leading-none tracking-[0.04em] text-text">
                Thuishaven
              </p>
              <p className="mt-1 text-[11px] text-text-dim">Tools</p>
            </div>
          </Link>
        </div>

        <div className="border-b border-border px-3 py-3">
          <div className="grid grid-cols-2 gap-1 bg-bg-elevated p-1">
            <ToolSwitch
              href="/dashboard"
              active={!isOutreach}
              label="Dashboard"
            />
            <ToolSwitch
              href="/outreach"
              active={isOutreach}
              label="Outreach"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-4">
          <p className="mb-2 px-2 text-[11px] font-medium tracking-[0.12em] text-text-dim uppercase">
            {toolLabel}
          </p>
          <nav className="space-y-0.5">
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  item.href !== "/outreach" &&
                  pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-contrast"
                      : "text-text-muted hover:bg-surface hover:text-text",
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-70" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 border-t border-border px-4 py-4">
          <ThemeToggle className="w-full justify-center" />
          <UserMenu />
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-text-muted transition-colors hover:text-text"
          >
            <Home className="size-3.5" />
            Hub
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/logo-mark.png"
              alt=""
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="font-display text-lg tracking-[0.04em]">
              Thuishaven
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle compact />
            <div className="flex gap-1 bg-surface p-1">
              <ToolSwitch href="/dashboard" active={!isOutreach} label="Dash" />
              <ToolSwitch href="/outreach" active={isOutreach} label="Out" />
            </div>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                item.href !== "/outreach" &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-contrast"
                    : "text-text-muted hover:text-text",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

function ToolSwitch({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "px-2 py-1.5 text-center text-sm transition-colors",
        active
          ? "bg-accent text-accent-contrast"
          : "text-text-muted hover:text-text",
      )}
    >
      {label}
    </Link>
  );
}
