import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listWeeztixEvents,
  weeztixWhoAmI,
} from "@/lib/integrations/weeztix/client";

export const dynamic = "force-dynamic";

/** Read-only preview van Weeztix events (geen sync). */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const me = await weeztixWhoAmI();
  const events = await listWeeztixEvents();

  return NextResponse.json({
    readOnly: true,
    me: me.ok
      ? {
          email: me.user.email,
          guid: me.user.guid,
          defaultCompany: me.user.default_company,
        }
      : { error: me.error },
    events: events.ok
      ? {
          count: events.events.length,
          items: events.events.slice(0, 50).map((e) => ({
            guid: e.guid,
            name: e.name,
            start: e.start,
            end: e.end,
          })),
        }
      : { error: events.error, status: events.status },
  });
}
