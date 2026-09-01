import { cache } from "react";
import { getEditionAnalysisBundle } from "@/lib/editions/analysis";
import { getWeatherImpact } from "@/lib/weather/impact";
import { getMailLiftByEdition } from "@/lib/editions/mail-lift";

/** Request-level cache — zelfde navigatie deelt data, geen herhaalde sync. */
export const loadEditionBundle = cache(async () =>
  getEditionAnalysisBundle({ limit: 120 }),
);

export const loadWeatherImpact = cache(async () =>
  getWeatherImpact({ fromYear: 2025, sync: false }),
);

export const loadMailLift = cache(async () =>
  getMailLiftByEdition({ limit: 40 }),
);

export { loadRecentMarketingPosts, loadMarketingPostsBundle } from "@/lib/marketing/posts";
export { getReferrerChannelTotals } from "@/lib/insights/referrers";
export {
  loadMarketingTimeline,
  loadChannelImpact,
} from "@/lib/marketing/timeline";
