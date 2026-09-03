"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Home,
  Plug,
  ScrollText,
  Send,
  Ticket,
  Users,
  Sparkles,
  Mail,
  LineChart,
  Workflow,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/auth/user-menu";
import {
  SocialChannelIcon,
  type SocialBrandChannel,
} from "@/components/ui/social-channel-icon";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Brand mark from /public/social-icons */
  brand?: SocialBrandChannel;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * Dashboard tool nav — grouped by job:
 * overzicht → marketing → systeem (dev).
 */
const dashboardSections: NavSection[] = [
  {
    id: "ops",
    label: "Overzicht",
    items: [
      { href: "/dashboard/inzichten", label: "Inzichten", icon: LineChart },
      { href: "/dashboard/tickets", label: "Tickets", icon: Ticket },
      { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
    ],
  },
  {
    id: "marketing",
    label: "Marketing (organic)",
    items: [
      { href: "/dashboard/mails", label: "Mailings", brand: "mail" },
      { href: "/dashboard/meta", label: "Meta", brand: "instagram" },
      { href: "/dashboard/tiktok", label: "TikTok", brand: "tiktok" },
      { href: "/dashboard/youtube", label: "YouTube", brand: "youtube" },
    ],
  },
];

const dashboardSystemNav: NavItem[] = [
  { href: "/dashboard/logs", label: "Log", icon: ScrollText },
  { href: "/koppelingen", label: "Bronnen", icon: Plug },
];

const outreachSections: NavSection[] = [
  {
    id: "outreach",
    label: "Outreach",
    items: [
      { href: "/outreach", label: "Overzicht", icon: Send },
      { href: "/outreach/planning", label: "Planning", icon: CalendarDays },
      { href: "/outreach/prospects", label: "Prospects", icon: Users },
      { href: "/outreach/uitsluitingen", label: "Uitsluitingen", icon: Ban },
      { href: "/outreach/campaigns", label: "Campagnes", icon: Sparkles },
      { href: "/outreach/emails", label: "E-mails", icon: Mail },
      { href: "/outreach/beschikbaarheid", label: "Agenda", icon: CalendarDays },
      { href: "/outreach/analytics", label: "Wat werkt", icon: LineChart },
      { href: "/outreach/pipeline", label: "Pipeline", icon: Workflow },
      { href: "/outreach/kosten", label: "Kosten", icon: BarChart3 },
    ],
  },
];

const outreachSystemNav: NavItem[] = [
  { href: "/koppelingen", label: "Bronnen", icon: Plug },
];

function isNavActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" &&
      href !== "/outreach" &&
      pathname.startsWith(href))
  );
}

function NavItemIcon({ item, active }: { item: NavItem; active: boolean }) {
  if (item.brand) {
    return (
      <SocialChannelIcon
        channel={item.brand}
        size={16}
        className={cn(
          "opacity-90 transition-[filter]",
          // Black glyphs: invert for dark idle + light active; cancel on dark active (yellow).
          active ? "invert dark:invert-0" : "dark:invert",
        )}
        alt=""
      />
    );
  }
  if (item.icon) {
    const Icon = item.icon;
    return <Icon className="size-4 shrink-0 opacity-70" />;
  }
  return null;
}

function NavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-accent text-accent-contrast"
          : "text-text-muted hover:bg-surface hover:text-text",
      )}
    >
      <NavItemIcon item={item} active={active} />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOutreach = pathname.startsWith("/outreach");
  const sections = isOutreach ? outreachSections : dashboardSections;
  const systemNav = isOutreach ? outreachSystemNav : dashboardSystemNav;

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
              href="/dashboard/inzichten"
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

        <div className="flex flex-1 flex-col overflow-y-auto px-2 py-4">
          <div className="space-y-5">
            {sections.map((section) => (
              <div key={section.id}>
                <p className="mb-1.5 px-2 text-[11px] font-medium tracking-[0.12em] text-text-dim uppercase">
                  {section.label}
                </p>
                <nav className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={isNavActive(pathname, item.href)}
                    />
                  ))}
                </nav>
              </div>
            ))}
          </div>

          <div className="mt-auto border-t border-border pt-4">
            <p className="mb-1.5 px-2 text-[11px] font-medium tracking-[0.12em] text-text-dim uppercase">
              Systeem
            </p>
            <nav className="space-y-0.5">
              {systemNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavActive(pathname, item.href)}
                />
              ))}
            </nav>
          </div>
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
              <ToolSwitch href="/dashboard/inzichten" active={!isOutreach} label="Dash" />
              <ToolSwitch href="/outreach" active={isOutreach} label="Out" />
            </div>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {[
            ...sections.flatMap((s) => s.items),
            ...systemNav,
          ].map((item) => {
            const active = isNavActive(pathname, item.href);
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
