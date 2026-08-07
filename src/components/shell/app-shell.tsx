"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Send,
  Ticket,
  Users,
  ImageIcon,
  Sparkles,
  Home,
} from "lucide-react";
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
  { href: "/dashboard/assets", label: "Creatives", icon: ImageIcon },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/chat", label: "AI Chat", icon: MessageSquare },
];

const outreachNav: NavItem[] = [
  { href: "/outreach", label: "Overzicht", icon: Send },
  { href: "/outreach/prospects", label: "Prospects", icon: Users },
  { href: "/outreach/campaigns", label: "Campagnes", icon: Sparkles },
  { href: "/outreach/emails", label: "E-mails", icon: Mail },
  { href: "/outreach/leads", label: "Leads", icon: Bell },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOutreach = pathname.startsWith("/outreach");
  const nav = isOutreach ? outreachNav : dashboardNav;
  const toolLabel = isOutreach ? "Bedrijfsevent Outreach" : "Marketing & Kaartverkoop";

  return (
    <div className="relative z-0 flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-bg-elevated lg:flex">
        <div className="border-b border-border px-5 py-5">
          <Link href="/" className="group block">
            <p className="font-display text-xl tracking-wide text-text transition-colors group-hover:text-accent">
              THUISHAVEN
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-text-muted">
              Tools
            </p>
          </Link>
        </div>

        <div className="border-b border-border px-3 py-3">
          <div className="grid grid-cols-2 gap-1 rounded-sm bg-bg p-1">
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

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-text-dim">
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
                    "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-text-muted hover:bg-surface hover:text-text",
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-80" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-border px-4 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-text-muted transition-colors hover:text-text"
          >
            <Home className="size-3.5" />
            Hub
          </Link>
          <p className="mt-2 text-[10px] text-text-dim">Mockdata · v0 foundation</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <Link href="/" className="font-display text-lg tracking-wide">
            THUISHAVEN
          </Link>
          <div className="flex gap-1 rounded-sm bg-surface p-1">
            <ToolSwitch href="/dashboard" active={!isOutreach} label="Dash" />
            <ToolSwitch href="/outreach" active={isOutreach} label="Out" />
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-sm px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-text-muted hover:text-text",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
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
        "rounded-sm px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide transition-colors",
        active
          ? "bg-accent text-bg"
          : "text-text-muted hover:text-text",
      )}
    >
      {label}
    </Link>
  );
}
