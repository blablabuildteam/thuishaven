"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSession } from "next-auth/react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  Crosshair,
  Disc3,
  Euro,
  Home,
  LayoutDashboard,
  MapPin,
  Menu,
  Plug,
  ScrollText,
  Send,
  Ticket,
  Users,
  Sparkles,
  LineChart,
  Workflow,
  Ban,
  Contact,
  Flame,
  FileText,
  X,
  BookOpen,
  Scale,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/auth/user-menu";
import { OutreachOnboardingTour } from "@/components/outreach/onboarding-tour";
import { DjFeesNavBadge, useDjFeesPendingCount } from "@/components/dashboard/dj-fees-nav-badge";
import { OmzetNavBadge, useOmzetPendingCount } from "@/components/dashboard/omzet-nav-badge";
import {
  SocialChannelIcon,
  type SocialBrandChannel,
} from "@/components/ui/social-channel-icon";
import { cn } from "@/lib/utils";
import {
  dashboardItemAllowed,
  dashboardSectionAllowed,
  normalizeToolAccess,
  outreachSectionAllowed,
  radarItemAllowed,
  radarSectionAllowed,
  TOOL_HOME,
  TOOL_LABEL,
  type ToolAccess,
  type ToolId,
} from "@/lib/auth/tool-access";

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
  badge?: "dj-fees-pending" | "omzet-pending";
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
      { href: "/dashboard/omzet", label: "Omzet", icon: Euro, badge: "omzet-pending" },
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
        label: "Meta ads",
        brand: "instagram",
      },
      {
        href: "/dashboard/paid/tiktok",
        label: "TikTok ads",
        brand: "tiktok",
      },
      {
        href: "/dashboard/paid/google",
        label: "Google Ads",
        brand: "google_ads",
      },
      {
        href: "/dashboard/paid/youtube",
        label: "YouTube ads",
        brand: "youtube",
      },
    ],
  },
];

const dashboardSystemNav: NavItem[] = [
  { href: "/dashboard/logs", label: "Log", icon: ScrollText, adminOnly: true },
  { href: "/koppelingen", label: "Bronnen", icon: Plug, adminOnly: true },
];

/** Dagelijkse flow: lijst → bedrijven → mailen → resultaten. */
const outreachSections: NavSection[] = [
  {
    id: "uitleg",
    label: "Uitleg",
    items: [
      {
        href: "/outreach/uitleg",
        label: "Hoe het werkt",
        icon: BookOpen,
      },
      {
        href: "/outreach/juridisch",
        label: "Juridisch",
        icon: Scale,
      },
    ],
  },
  {
    id: "werken",
    label: "Stappen",
    items: [
      {
        href: "/outreach/lijst-bijwerken",
        label: "1 · Lijst bijwerken",
        icon: Users,
        tourId: "nav-lijst",
      },
      {
        href: "/outreach/crm",
        label: "2 · Bedrijven",
        icon: Contact,
        tourId: "nav-bedrijven",
      },
      {
        href: "/outreach/analytics",
        label: "3 · Resultaten",
        icon: LineChart,
        tourId: "nav-resultaten",
      },
      {
        href: "/outreach/leads",
        label: "Warme leads",
        icon: Flame,
        tourId: "nav-leads",
      },
      {
        href: "/outreach/templates",
        label: "Templates",
        icon: FileText,
        tourId: "nav-templates",
      },
    ],
  },
  {
    id: "beheer",
    label: "Alleen admin",
    adminOnly: true,
    items: [
      {
        href: "/outreach/uitsluitingen",
        label: "Niet mailen",
        icon: Ban,
        adminOnly: true,
      },
      {
        href: "/outreach/instellingen",
        label: "Instellingen",
        icon: Settings,
        adminOnly: true,
      },
      {
        href: "/outreach/beschikbaarheid",
        label: "Agenda",
        icon: CalendarDays,
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

const radarSections: NavSection[] = [
  {
    id: "scout",
    label: "Scouten",
    items: [
      { href: "/radar/artiesten", label: "Artiesten", icon: Disc3 },
      { href: "/radar/alerts", label: "Alerts", icon: Bell },
      { href: "/radar/uitleg", label: "Uitleg", icon: BookOpen },
    ],
  },
  {
    id: "curatie",
    label: "Curatie",
    items: [
      { href: "/radar/venues", label: "Venues", icon: MapPin },
    ],
  },
  {
    id: "beheer",
    label: "Alleen admin",
    adminOnly: true,
    items: [
      {
        href: "/radar/instellingen",
        label: "Instellingen",
        icon: Settings,
        adminOnly: true,
      },
    ],
  },
];

const radarSystemNav: NavItem[] = [
  { href: "/koppelingen", label: "Bronnen", icon: Plug, adminOnly: true },
];

function toolFromPath(pathname: string): ToolId {
  if (pathname.startsWith("/outreach")) return "outreach";
  if (pathname.startsWith("/radar")) return "radar";
  return "dashboard";
}

function isNavActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" &&
      href !== "/outreach" &&
      href !== "/radar" &&
      pathname.startsWith(href))
  );
}

function filterNav(items: NavItem[], isAdmin: boolean) {
  return items.filter((item) => isAdmin || !item.adminOnly);
}

function filterSections(
  sections: NavSection[],
  isAdmin: boolean,
  access: ToolAccess,
  tool: ToolId,
) {
  return sections
    .filter((s) => isAdmin || !s.adminOnly)
    .filter((s) => {
      if (tool === "outreach") return outreachSectionAllowed(s.id, access);
      if (tool === "radar") return radarSectionAllowed(s.id, access);
      return dashboardSectionAllowed(s.id, access);
    })
    .map((s) => ({
      ...s,
      items: filterNav(s.items, isAdmin).filter((item) => {
        if (item.adminOnly) return true;
        if (tool === "outreach") return true;
        if (tool === "radar") return radarItemAllowed(item.href, access);
        return dashboardItemAllowed(item.href, access);
      }),
    }))
    .filter((s) => s.items.length > 0);
}

function sectionsForTool(tool: ToolId): NavSection[] {
  if (tool === "outreach") return outreachSections;
  if (tool === "radar") return radarSections;
  return dashboardSections;
}

function systemNavForTool(tool: ToolId): NavItem[] {
  if (tool === "outreach") return outreachSystemNav;
  if (tool === "radar") return radarSystemNav;
  return dashboardSystemNav;
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
  const router = useRouter();
  const content = (
    <>
      <NavItemIcon item={item} active={active} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge === "dj-fees-pending" ? (
        <DjFeesNavBadge count={badgeCount ?? null} active={active} />
      ) : item.badge === "omzet-pending" ? (
        <OmzetNavBadge count={badgeCount ?? null} active={active} />
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
      prefetch
      data-tour={item.tourId}
      onClick={onNavigate}
      onMouseEnter={() => {
        void router.prefetch(item.href);
      }}
      onFocus={() => {
        void router.prefetch(item.href);
      }}
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
  activeTool,
  sections,
  systemNav,
  djFeesPending,
  omzetPending,
  viewAsStaff,
  onToggleViewAsStaff,
  onNavigate,
  onClose,
  showDashboard,
  showOutreach,
  showRadar,
}: {
  pathname: string;
  activeTool: ToolId;
  sections: NavSection[];
  systemNav: NavItem[];
  djFeesPending: number | null;
  omzetPending: number | null;
  viewAsStaff?: boolean;
  onToggleViewAsStaff?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
  showDashboard: boolean;
  showOutreach: boolean;
  showRadar: boolean;
}) {
  const toolSwitches = (
    [
      showDashboard
        ? {
            id: "dashboard" as const,
            href: TOOL_HOME.dashboard,
            label: TOOL_LABEL.dashboard,
            icon: LayoutDashboard,
          }
        : null,
      showOutreach
        ? {
            id: "outreach" as const,
            href: TOOL_HOME.outreach,
            label: TOOL_LABEL.outreach,
            icon: Send,
          }
        : null,
      showRadar
        ? {
            id: "radar" as const,
            href: TOOL_HOME.radar,
            label: TOOL_LABEL.radar,
            icon: Crosshair,
          }
        : null,
    ] as const
  ).filter(Boolean) as Array<{
    id: ToolId;
    href: string;
    label: string;
    icon: LucideIcon;
  }>;

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
        {toolSwitches.length > 1 ? (
          <ToolPicker
            tools={toolSwitches}
            activeTool={activeTool}
            onNavigate={onNavigate}
          />
        ) : (
          <p className="px-1 py-1.5 font-display text-sm tracking-[0.04em] text-text">
            {TOOL_LABEL[activeTool]}
          </p>
        )}
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
                      item.badge === "dj-fees-pending"
                        ? djFeesPending
                        : item.badge === "omzet-pending"
                          ? omzetPending
                          : null
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
        {onToggleViewAsStaff ? (
          <button
            type="button"
            onClick={onToggleViewAsStaff}
            className="w-full border border-border px-2 py-1.5 font-display text-xs tracking-[0.12em] text-text-muted transition-colors hover:border-accent hover:text-text"
          >
            {viewAsStaff ? "Terug naar admin" : "Bekijk als medewerker"}
          </button>
        ) : null}
        <ThemeToggle className="w-full justify-center" />
        <UserMenu hideAdminLinks={viewAsStaff} />
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

const VIEW_AS_STAFF_KEY = "th-view-as-staff";
const VIEW_AS_EVENT = "th-view-as-staff";

function subscribeViewAsStaff(onChange: () => void) {
  window.addEventListener(VIEW_AS_EVENT, onChange);
  return () => window.removeEventListener(VIEW_AS_EVENT, onChange);
}

function readViewAsStaff() {
  return window.localStorage.getItem(VIEW_AS_STAFF_KEY) === "1";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useSession();
  const isAdmin = data?.user?.role === "admin";
  const viewAsStaff = useSyncExternalStore(
    subscribeViewAsStaff,
    readViewAsStaff,
    () => false,
  );
  function toggleViewAsStaff() {
    window.localStorage.setItem(VIEW_AS_STAFF_KEY, viewAsStaff ? "0" : "1");
    window.dispatchEvent(new Event(VIEW_AS_EVENT));
  }
  const showAdminNav = Boolean(isAdmin) && !viewAsStaff;
  const activeTool = toolFromPath(pathname);
  const isOutreach = activeTool === "outreach";
  const toolAccess = normalizeToolAccess(
    data?.user?.toolAccess,
    data?.user?.role === "admin" ? "admin" : "member",
    data?.user?.email,
  );
  const djFeesPending = useDjFeesPendingCount(activeTool === "dashboard");
  const omzetPending = useOmzetPendingCount(activeTool === "dashboard");
  const sections = filterSections(
    sectionsForTool(activeTool),
    showAdminNav,
    toolAccess,
    activeTool,
  );
  const systemNav = filterNav(systemNavForTool(activeTool), showAdminNav);
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
    activeTool,
    sections,
    systemNav,
    djFeesPending,
    omzetPending,
    viewAsStaff: Boolean(isAdmin) && viewAsStaff,
    onToggleViewAsStaff: isAdmin ? toggleViewAsStaff : undefined,
    showDashboard: toolAccess.dashboard,
    showOutreach: toolAccess.outreach,
    showRadar: toolAccess.radar,
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

      {/* relative: absolutely positioned bits inside wide tables (sr-only) must not widen the page */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-x-clip">
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
            <span className="truncate text-xs tracking-[0.12em] text-text-dim uppercase">
              {TOOL_LABEL[activeTool]}
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
          {isAdmin && viewAsStaff ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border border-accent bg-accent/10 px-3 py-2 text-sm">
              <p>
                Je kijkt als <strong>medewerker</strong>. Beheer en Systeem
                zijn verborgen. Je rechten zijn niet veranderd.
              </p>
              <button
                type="button"
                onClick={toggleViewAsStaff}
                className="border border-accent px-2 py-1 text-xs tracking-[0.08em] hover:bg-accent hover:text-accent-contrast"
              >
                Terug naar admin
              </button>
            </div>
          ) : null}
          {children}
        </main>
      </div>
      {isOutreach ? <OutreachOnboardingTour /> : null}
    </div>
  );
}

function ToolPicker({
  tools,
  activeTool,
  onNavigate,
}: {
  tools: Array<{ id: ToolId; href: string; label: string; icon: LucideIcon }>;
  activeTool: ToolId;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = tools.find((t) => t.id === activeTool) ?? tools[0];

  // Prefetch andere tools zodat switchen sneller voelt.
  useEffect(() => {
    for (const tool of tools) {
      if (tool.id !== activeTool) router.prefetch(tool.href);
    }
  }, [tools, activeTool, router]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!active) return null;
  const ActiveIcon = active.icon;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Kies tool"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-accent px-3 py-2 text-left text-sm text-accent-contrast transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ActiveIcon className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="font-display tracking-[0.04em]">{active.label}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 opacity-80 transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Tools"
          className="absolute inset-x-0 top-full z-40 mt-1 border border-border bg-bg py-1 shadow-sm"
        >
          {tools.map((tool) => {
            const selected = tool.id === active.id;
            const Icon = tool.icon;
            return (
              <li key={tool.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                    if (tool.id !== active.id) {
                      startTransition(() => {
                        router.push(tool.href);
                      });
                    }
                  }}
                  onMouseEnter={() => router.prefetch(tool.href)}
                  onFocus={() => router.prefetch(tool.href)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-accent text-accent-contrast"
                      : "text-text-muted hover:bg-surface hover:text-text",
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="font-display tracking-[0.04em]">
                    {tool.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
