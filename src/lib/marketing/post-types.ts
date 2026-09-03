/** Client-safe marketing post types — no DB / Node imports. */

export type MarketingVisualFeatures = {
  dominantColors?: string[];
  hasTextOverlay?: boolean;
  format?: string;
  composition?: string | null;
  subjects?: string[];
  textInImage?: string | null;
  artists?: string[];
  offer?:
    | "lineup"
    | "early_bird"
    | "sold_out"
    | "aftermovie"
    | "recap"
    | "door"
    | "other";
  mood?: string | null;
  palette?: string[];
  editionGuess?: string | null;
};

export type SalesImpactRole = "promo" | "same_day" | "after";

/** Client-safe ticket lift snapshot. */
export type TicketLift = {
  sold: number | null;
  daysCovered: number;
  dayFrom: string;
  dayTo: string;
  signal: "measured" | "no_curve" | "excluded";
  role?: SalesImpactRole;
  windowLabel?: string;
};

export type SocialFeedChannel = "instagram" | "tiktok" | "youtube";

export type MarketingPostRow = {
  id: string;
  channel: "instagram" | "tiktok" | "youtube" | "brevo" | "other";
  editionId: string | null;
  externalId: string | null;
  title: string | null;
  caption: string | null;
  permalink: string | null;
  publishedAt: string | null;
  reach: number;
  impressions: number;
  engagement: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  storedMediaUrl: string | null;
  videoUrl: string | null;
  visualFeatures: MarketingVisualFeatures | null;
  analyzedAt: string | null;
  syncedAt: string | null;
  ticketLift: TicketLift | null;
};

export type MarketingPostsPage = {
  posts: MarketingPostRow[];
  hasMore: boolean;
  /** Cursor for the next page (publishedAt + id of last row). */
  nextCursor: string | null;
};
