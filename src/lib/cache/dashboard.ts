import { cache } from "react";
import { DASHBOARD_TTL_MS, rememberTtl } from "@/lib/cache/ttl";
import { getEditionAnalysisBundle } from "@/lib/editions/analysis";
import { getWeatherImpact } from "@/lib/weather/impact";
import { getMailLiftByEdition } from "@/lib/editions/mail-lift";

/** Request-level + process TTL — navigating away and back reuses the payload. */
export const loadEditionBundle = cache(async () =>
  rememberTtl("edition-bundle", DASHBOARD_TTL_MS, () =>
    getEditionAnalysisBundle({ limit: 120 }),
  ),
);

export const loadWeatherImpact = cache(async () =>
  rememberTtl("weather-impact", DASHBOARD_TTL_MS, () =>
    getWeatherImpact({ fromYear: 2025, sync: false }),
  ),
);

export const loadMailLift = cache(async () =>
  rememberTtl("mail-lift", DASHBOARD_TTL_MS, () =>
    getMailLiftByEdition({ limit: 40 }),
  ),
);

export { loadRecentMarketingPosts, loadMarketingPostsBundle } from "@/lib/marketing/posts";
export { getReferrerChannelTotals } from "@/lib/insights/referrers";
export {
  loadMarketingTimeline,
  loadChannelImpact,
} from "@/lib/marketing/timeline";
