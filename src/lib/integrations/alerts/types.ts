export type SecondaryChannel = "resident_advisor" | "ticketswap" | "appic";

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
