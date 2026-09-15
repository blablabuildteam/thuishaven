export type SecondaryChannel = "resident_advisor" | "ticketswap" | "appic";

export type AlertRuleKind =
  | "soldout_mismatch"
  | "sales_threshold"
  | "weather";

export type DashboardAlertType =
  | "ticketswap_after_soldout"
  | "weeztix_soldout_ra_open"
  | "custom"
  | "sales_threshold"
  | "weather";

export const DASHBOARD_ALERT_TYPES: DashboardAlertType[] = [
  "ticketswap_after_soldout",
  "weeztix_soldout_ra_open",
  "custom",
  "sales_threshold",
  "weather",
];

/** Platforms we ask to take tickets down after Weeztix sold-out. */
export type TakedownChannel = "resident_advisor" | "appic";

export type SecondarySoldOutConflict = {
  editionId: string;
  editionName: string;
  startsAt: Date;
  channel: SecondaryChannel;
  channelLabel: string;
  kind: "overbooking" | "revenue_leak";
  title: string;
  message: string;
  availableCount: number | null;
  url: string | null;
};

export type StoredAlert = {
  id: string;
  type: string;
  ruleId: string | null;
  editionId: string | null;
  title: string;
  message: string;
  isActive: boolean;
  createdAt: Date;
  notifiedAt: Date | null;
  resolvedAt: Date | null;
};
