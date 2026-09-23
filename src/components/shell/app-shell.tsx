"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Disc3,
  ClipboardList,
  Home,
  Menu,
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
  MessageSquare,
  Contact,
  X,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/auth/user-menu";
import { OutreachOnboardingTour } from "@/components/outreach/onboarding-tour";
import { DjFeesNavBadge, useDjFeesPendingCount } from "@/components/dashboard/dj-fees-nav-badge";
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
  /** Only show for admin accounts */
  adminOnly?: boolean;
  /** Visible but not clickable until the feature is ready */
  disabled?: boolean;
  /** Clickable but grayed until an integration is live */
  pending?: boolean;
  /** Spotlight tour target id */
  tourId?: string;
  /** Extra nav affordance */
  badge?: "dj-fees-pending";
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
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
      { href: "/dashboard/dj-fees", label: "DJ-fees", icon: Disc3, badge: "dj-fees-pending" },
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
  {
    id: "marketing-paid",
    label: "Marketing (paid)",
    items: [
      {
        href: "/dashboard/paid/meta",
        label: "Meta",
        brand: "instagram",
      },
      {
        href: "/dashboard/paid/tiktok",
        label: "TikTok",
        brand: "tiktok",
      },
      {
        href: "/dashboard/paid/google",
        label: "Google Ads",
        brand: "google_ads",
        pending: true,
      },
      {
        href: "/dashboard/paid/youtube",
        label: "YouTube",
        brand: "youtube",
        pending: true,
      },
    ],
  },
];

const dashboardSystemNav: NavItem[] = [
  { href: "/dashboard/logs", label: "Log", icon: ScrollText, adminOnly: true },
  { href: "/koppelingen", label: "Bronnen", icon: Plug, adminOnly: true },
];

/** Simpele flow: lijst bijwerken → bedrijven → mailen → resultaten. */
const outreachSections: NavSection[] = [
  {
    id: "werken",
    label: "Werken",
    items: [
      { href: "/outreach", label: "Overzicht", icon: Send, tourId: "nav-overzicht" },
      {
        href: "/outreach/uitleg",
        label: "Hoe het werkt",
        icon: BookOpen,
      },
      {
        href: "/outreach/lijst-bijwerken",
        label: "Lijst bijwerken",
        icon: Users,
        tourId: "nav-lijst",
      },
      { href: "/outreach/crm", label: "Bedrijven", icon: Contact, tourId: "nav-bedrijven" },
      { href: "/outreach/emails", label: "Mailen", icon: Mail, tourId: "nav-mailen" },
      { href: "/outreach/templates", label: "Templates", icon: Sparkles },
      {
        href: "/outreach/analytics",
        label: "Resultaten",
        icon: LineChart,
        tourId: "nav-resultaten",
      },
      {
        href: "/outreach/beschikbaarheid",
        label: "Agenda",
        icon: CalendarDays,
        tourId: "nav-agenda",
      },
    ],
  },
  {
    id: "beheer",
    label: "Beheer",
    adminOnly: true,
    items: [
      {
        href: "/outreach/prospects",
        label: "Lijst (admin)",
        icon: Users,
        adminOnly: true,
      },
      {
        href: "/outreach/uitsluitingen",
        label: "Niet mailen",
        icon: Ban,
        adminOnly: true,
      },
      {
        href: "/outreach/planning",
        label: "Wachtrij",
        icon: ClipboardList,
        adminOnly: true,
      },
      {
        href: "/outreach/leads",
        label: "Warme leads",
        icon: MessageSquare,
        adminOnly: true,
      },
      {
        href: "/outreach/campaigns",
        label: "Campagnes",
        icon: Sparkles,
        adminOnly: true,
      },
      {
        href: "/outreach/kosten",
        label: "Kosten",
        icon: BarChart3,
        adminOnly: true,
      },
    ],
  },
];

const outreachSystemNav: NavItem[] = [
  {
    href: "/outreach/pipeline",
    label: "Pipeline",
    icon: Workflow,
    adminOnly: true,
  },
  { href: "/koppelingen", label: "Bronnen", icon: Plug, adminOnly: true },
];

function isNavActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" &&
      href !== "/outreach" &&
      pathname.startsWith(href))
  );
}

function filterNav(items: NavItem[], isAdmin: boolean) {
  return items.filter((item) => isAdmin || !item.adminOnly);
}

function filterSections(sections: NavSection[], isAdmin: boolean) {
  return sections
    .filter((s) => isAdmin || !s.adminOnly)
    .map((s) => ({ ...s, items: filterNav(s.items, isAdmin) }))
    .filter((s) => s.items.length > 0);
}

function NavItemIcon({ item, active }: { item: NavItem; active: boolean }) {
  const muted = item.disabled || item.pending;
  if (item.brand) {
    return (
      <SocialChannelIcon
        channel={item.brand}
        size={16}
        className={cn(
          "transition-[filter]",
          muted
            ? "opacity-40 grayscale"
            : cn(
                "opacity-90",
                active ? "invert dark:invert-0" : "dark:invert",
              ),
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
  badgeCount,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  badgeCount?: number | null;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <NavItemIcon item={item} active={active} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge === "dj-fees-pending" ? (
        <DjFeesNavBadge count={badgeCount ?? null} active={active} />
      ) : null}
    </>
  );

  if (item.disabled) {
    return (
      <span
        aria-disabled="true"
        title="Nog niet beschikbaar"
        className="flex cursor-not-allowed items-center gap-2.5 px-2.5 py-2 text-sm text-text-dim opacity-60"
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      data-tour={item.tourId}
      onClick={onNavigate}
      title={item.pending ? "Nog niet gekoppeld" : undefined}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 text-sm transition-colors",
        item.pending
          ? "text-text-dim opacity-60 hover:bg-surface hover:opacity-80"
          : active
            ? "bg-accent text-accent-contrast"
            : "text-text-muted hover:bg-surface hover:text-text",
      )}
    >
      {content}
    </Link>
  );
}

function ShellNav({
  pathname,
  isOutreach,
  sections,
  systemNav,
  djFeesPending,
  onNavigate,
  onClose,
}: {
  pathname: string;
  isOutreach: boolean;
  sections: NavSection[];
  systemNav: NavItem[];
  djFeesPending: number | null;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="group flex min-w-0 items-center gap-3"
        >
          <Image
            src="/brand/logo-mark.png"
            alt=""
            width={36}
            height={36}
            className="size-9 object-contain"
            priority
          />
          <div className="min-w-0">
            <p className="font-display text-lg leading-none tracking-[0.04em] text-text">
              Thuishaven
            </p>
            <p className="mt-1 text-[11px] text-text-dim">Tools</p>
          </div>
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Menu sluiten"
            className="inline-flex size-9 shrink-0 items-center justify-center text-text-muted hover:text-text"
          >
            <X className="size-5" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <div className="border-b border-border px-3 py-3">
        <div className="grid grid-cols-2 gap-1 bg-bg-elevated p-1">
          <ToolSwitch
            href="/dashboard/inzichten"
            active={!isOutreach}
            label="Dashboard"
            onNavigate={onNavigate}
          />
          <ToolSwitch
            href="/outreach"
            active={isOutreach}
            label="Outreach"
            onNavigate={onNavigate}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-4">
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
                    active={
                      !item.disabled &&
                      !item.pending &&
                      isNavActive(pathname, item.href)
                    }
                    badgeCount={
                      item.badge === "dj-fees-pending" ? djFeesPending : null
                    }
                    onNavigate={onNavigate}
                  />
                ))}
              </nav>
            </div>
          ))}
        </div>

        {systemNav.length > 0 ? (
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
                  onNavigate={onNavigate}
                />
              ))}
            </nav>
          </div>
        ) : (
          <div className="mt-auto" />
        )}
      </div>

      <div className="space-y-3 border-t border-border px-4 py-4">
        <ThemeToggle className="w-full justify-center" />
        <UserMenu />
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 text-xs text-text-muted transition-colors hover:text-text"
        >
          <Home className="size-3.5" />
          Tools
        </Link>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useSession();
  const isAdmin = data?.user?.role === "admin";
  const isOutreach = pathname.startsWith("/outreach");
  const djFeesPending = useDjFeesPendingCount(!isOutreach);
  const sections = isOutreach
    ? filterSections(outreachSections, isAdmin)
    : dashboardSections;
  const systemNav = filterNav(
    isOutreach ? outreachSystemNav : dashboardSystemNav,
    isAdmin,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const openNav = () => setMenuOpen(true);
    const closeNav = () => setMenuOpen(false);
    window.addEventListener("thuishaven:open-nav", openNav);
    window.addEventListener("thuishaven:close-nav", closeNav);
    return () => {
      window.removeEventListener("thuishaven:open-nav", openNav);
      window.removeEventListener("thuishaven:close-nav", closeNav);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const navProps = {
    pathname,
    isOutreach,
    sections,
    systemNav,
    djFeesPending,
  };

  return (
    <div className="relative z-0 flex min-h-screen min-w-0 bg-bg">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-bg lg:flex">
        <ShellNav {...navProps} />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Menu sluiten"
            onClick={closeMenu}
            className="insight-modal-backdrop absolute inset-0 bg-black/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="mobile-nav-panel absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-border bg-bg"
          >
            <ShellNav {...navProps} onNavigate={closeMenu} onClose={closeMenu} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-bg/95 px-3 py-3 backdrop-blur-md sm:px-4 lg:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src="/brand/logo-mark.png"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 object-contain"
            />
            <span className="truncate font-display text-lg tracking-[0.04em]">
              Thuishaven
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle compact />
            <button
              type="button"
              aria-label="Menu openen"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="inline-flex size-9 items-center justify-center text-text hover:bg-surface"
            >
              <Menu className="size-5" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-5 sm:px-6 sm:py-6 lg:px-10">
          {children}
        </main>
      </div>
      {isOutreach ? <OutreachOnboardingTour /> : null}
    </div>
  );
}

function ToolSwitch({
  href,
  active,
  label,
  onNavigate,
}: {
  href: string;
  active: boolean;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "px-2 py-1.5 text-center text-sm transition-colors",
        active
          ? "bg-accent text-accent-contrast"
          : "text-text-muted hover:bg-surface hover:text-text",
      )}
    >
      {label}
    </Link>
  );
}
