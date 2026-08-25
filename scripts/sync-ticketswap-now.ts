import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "fs";
import { endDb } from "../src/lib/db/client";
import type { TicketswapEvent } from "../src/lib/integrations/ticketswap/client";
import {
  parseTicketswapDateText,
  parseTicketswapLocationHtml,
} from "../src/lib/integrations/ticketswap/parse-location";
import { syncTicketSwapReadOnly } from "../src/lib/integrations/ticketswap/sync";

function eventsFromJson(path: string): TicketswapEvent[] {
  const rows = JSON.parse(readFileSync(path, "utf8")) as Array<{
    title: string;
    startsAt?: string;
    availableCount: number;
    url?: string;
  }>;
  return rows.map((row) => {
    const url = row.url ?? null;
    return {
      id: url ? new URL(url).pathname.replace(/\/+$/, "") : row.title,
      title: row.title,
      startsAt: parseTicketswapDateText(row.startsAt ?? "", url),
      availableCount: row.availableCount,
      contentUrl: url,
    };
  });
}

async function main() {
  const source = process.argv[2];
  let events: TicketswapEvent[] | undefined;
  if (source?.endsWith(".html")) {
    events = parseTicketswapLocationHtml(readFileSync(source, "utf8"));
  } else if (source?.endsWith(".json")) {
    events = eventsFromJson(source);
  }
  if (events) {
    console.log(`source=${source} events=${events.length}`);
    for (const e of events) {
      console.log(
        `${String(e.availableCount).padStart(3)} | ${e.title} | ${e.startsAt?.toISOString() ?? "-"}`,
      );
    }
  }
  const result = await syncTicketSwapReadOnly(events ? { events } : undefined);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
