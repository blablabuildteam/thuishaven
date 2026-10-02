/**
 * Per-user tool access: which apps they may open, and which areas inside.
 * Admins always get full access (role wins over stored toggles).
 */

export type ToolId = "dashboard" | "outreach";

export type DashboardArea = "overzicht" | "omzet" | "marketing";
export type OutreachArea = "stappen" | "uitleg";

export type ToolAccess = {
  dashboard: boolean;
  outreach: boolean;
  dashboardAreas: Record<DashboardArea, boolean>;
  outreachAreas: Record<OutreachArea, boolean>;
};

export const DASHBOARD_AREA_LABELS: Record<DashboardArea, string> = {
  overzicht: "Overzicht (inzichten, tickets, alerts, DJ-fees)",
  omzet: "Omzet",
  marketing: "Marketing (organic + paid)",
};

export const OUTREACH_AREA_LABELS: Record<OutreachArea, string> = {
  stappen: "Stappen (lijst → mailen → resultaten) + templates",
  uitleg: "Uitleg & juridisch",
};

export const DEFAULT_TOOL_ACCESS: ToolAccess = {
  dashboard: true,
  outreach: true,
  dashboardAreas: {
    overzicht: true,
    omzet: true,
    marketing: true,
  },
  outreachAreas: {
    stappen: true,
    uitleg: true,
  },
};

export function normalizeToolAccess(
  raw: unknown,
  role: "admin" | "member" = "member",
): ToolAccess {
  if (role === "admin") {
    return {
      dashboard: true,
      outreach: true,
      dashboardAreas: { ...DEFAULT_TOOL_ACCESS.dashboardAreas },
      outreachAreas: { ...DEFAULT_TOOL_ACCESS.outreachAreas },
    };
  }

  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const areas = (
    value: unknown,
    defaults: Record<string, boolean>,
  ): Record<string, boolean> => {
    const src =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const out: Record<string, boolean> = {};
    for (const key of Object.keys(defaults)) {
      out[key] = typeof src[key] === "boolean" ? src[key] : defaults[key];
    }
    return out;
  };

  return {
    dashboard: typeof obj.dashboard === "boolean" ? obj.dashboard : true,
    outreach: typeof obj.outreach === "boolean" ? obj.outreach : true,
    dashboardAreas: areas(
      obj.dashboardAreas,
      DEFAULT_TOOL_ACCESS.dashboardAreas,
    ) as ToolAccess["dashboardAreas"],
    outreachAreas: areas(
      obj.outreachAreas,
      DEFAULT_TOOL_ACCESS.outreachAreas,
    ) as ToolAccess["outreachAreas"],
  };
}

/** First tool the user may open (hub redirect / empty selection). */
export function homePathForAccess(access: ToolAccess): string {
  if (access.dashboard) return "/dashboard/inzichten";
  if (access.outreach) return "/outreach/crm";
  return "/";
}

export function toolForPath(path: string): ToolId | "admin" | "other" {
  if (
    path.startsWith("/admin") ||
    path.startsWith("/koppelingen") ||
    path.startsWith("/dashboard/logs")
  ) {
    return "admin";
  }
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/outreach")) return "outreach";
  return "other";
}

/** Dashboard nav section ids from app-shell. */
export function dashboardSectionAllowed(
  sectionId: string,
  access: ToolAccess,
): boolean {
  if (!access.dashboard) return false;
  if (sectionId === "ops") {
    // ops mixes overzicht + omzet — filter items instead when possible
    return access.dashboardAreas.overzicht || access.dashboardAreas.omzet;
  }
  if (sectionId === "marketing" || sectionId === "marketing-paid") {
    return access.dashboardAreas.marketing;
  }
  return true;
}

export function dashboardItemAllowed(
  href: string,
  access: ToolAccess,
): boolean {
  if (!access.dashboard) return false;
  if (href === "/dashboard/omzet") return access.dashboardAreas.omzet;
  if (
    href.startsWith("/dashboard/mails") ||
    href.startsWith("/dashboard/meta") ||
    href.startsWith("/dashboard/tiktok") ||
    href.startsWith("/dashboard/youtube") ||
    href.startsWith("/dashboard/paid")
  ) {
    return access.dashboardAreas.marketing;
  }
  // inzichten, tickets, alerts, dj-fees
  return access.dashboardAreas.overzicht;
}

export function outreachSectionAllowed(
  sectionId: string,
  access: ToolAccess,
): boolean {
  if (!access.outreach) return false;
  if (sectionId === "uitleg") return access.outreachAreas.uitleg;
  if (sectionId === "werken") return access.outreachAreas.stappen;
  if (sectionId === "beheer") return true; // still gated by admin role
  return true;
}

/**
 * Whether this path is allowed for the session.
 * Admin role bypasses tool toggles for everything except we still allow members
 * only into granted tools.
 */
export function canAccessPath(
  path: string,
  access: ToolAccess,
  role: "admin" | "member",
): boolean {
  if (role === "admin") return true;

  const tool = toolForPath(path);
  if (tool === "admin") return false;
  if (tool === "other") return true; // hub `/`, account, etc.

  if (tool === "dashboard") {
    if (!access.dashboard) return false;
    return dashboardItemAllowed(path, access);
  }

  if (tool === "outreach") {
    if (!access.outreach) return false;
    if (
      path.startsWith("/outreach/uitleg") ||
      path.startsWith("/outreach/juridisch")
    ) {
      return access.outreachAreas.uitleg;
    }
    if (
      path.startsWith("/outreach/uitsluitingen") ||
      path.startsWith("/outreach/instellingen") ||
      path.startsWith("/outreach/beschikbaarheid") ||
      path.startsWith("/outreach/kosten") ||
      path.startsWith("/outreach/pipeline")
    ) {
      return false; // admin-only routes
    }
    return access.outreachAreas.stappen;
  }

  return true;
}
