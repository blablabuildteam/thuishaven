import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import {
  ensureWeeztixAccessToken,
  weeztixTokenStatus,
} from "../src/lib/integrations/weeztix/tokens";
import {
  listWeeztixEvents,
  weeztixGet,
  weeztixWhoAmI,
} from "../src/lib/integrations/weeztix/client";

function summarizeShape(value: unknown, depth = 0): unknown {
  if (depth > 4) return typeof value;
  if (value == null) return value;
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value[0] != null ? summarizeShape(value[0], depth + 1) : null,
    };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const out: Record<string, unknown> = { keys: keys.slice(0, 40) };
    for (const k of keys.slice(0, 12)) {
      out[k] = summarizeShape(obj[k], depth + 1);
    }
    return out;
  }
  return typeof value;
}

async function main() {
  const before = await weeztixTokenStatus();
  console.log(
    JSON.stringify(
      {
        before: {
          hasAccess: before.hasAccess,
          hasRefresh: before.hasRefresh,
          expired: before.expired,
          accessExpiresAt: before.accessExpiresAt,
          source: before.source,
        },
      },
      null,
      2,
    ),
  );

  const token = await ensureWeeztixAccessToken();
  if (!token.ok) {
    console.log(JSON.stringify({ ok: false, error: token.error }));
    return;
  }

  const after = await weeztixTokenStatus();
  const me = await weeztixWhoAmI();
  const events = await listWeeztixEvents();
  const eventList = events.ok ? events.events : [];
  const sample = eventList.find((e) => e.guid) ?? eventList[0];
  let statsShape: unknown = null;
  let statsError: string | null = null;
  if (sample?.guid) {
    const stats = await weeztixGet({
      path: `/statistics/dashboard/${sample.guid}`,
    });
    if (stats.ok) statsShape = summarizeShape(stats.data);
    else statsError = stats.error;
  }

  console.log(
    JSON.stringify(
      {
        ok: me.ok && events.ok,
        after: {
          expired: after.expired,
          accessExpiresAt: after.accessExpiresAt,
          source: after.source,
        },
        me: me.ok
          ? { email: me.user.email, company: me.user.default_company }
          : { error: me.error },
        events: events.ok ? { count: events.events.length } : { error: events.error },
        statsSampleEvent: sample
          ? { guid: String(sample.guid).slice(0, 8), name: sample.name }
          : null,
        statsError,
        statsShape,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
