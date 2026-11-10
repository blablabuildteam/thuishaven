/**
 * Maandag-digest: top stijgers, nieuwe namen, venster-sluit.
 * Live send alleen met RADAR_LIVE_DIGEST=true; anders altijd team@blablabuild.com.
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import {
  alertSender,
  sendBrevoTransactionalEmail,
} from "@/lib/integrations/brevo/client";
import { createRadarAlert } from "@/lib/radar/alerts";
import { radarAlerts, radarArtists } from "@/lib/radar/schema";
import { loadRadarSettings } from "@/lib/radar/settings";

const TEST_TO = "team@blablabuild.com";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseUrl() {
  return (
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://thuishaven.vercel.app"
  );
}

export type DigestPayload = {
  risers: Array<{
    id: string;
    name: string;
    score: number;
    velocity: number;
    reasons: string[];
  }>;
  newcomers: Array<{
    id: string;
    name: string;
    score: number;
    reasons: string[];
  }>;
  windowClosing: Array<{
    id: string;
    name: string;
    score: number;
    reasons: string[];
  }>;
};

export async function buildRadarDigest(): Promise<DigestPayload> {
  if (!hasDatabase()) {
    return { risers: [], newcomers: [], windowClosing: [] };
  }
  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const top = await db
    .select()
    .from(radarArtists)
    .where(
      and(
        eq(radarArtists.homeGigCount, 0),
        sql`${radarArtists.status} not in ('passed', 'not_relevant', 'booked')`,
      ),
    )
    .orderBy(desc(radarArtists.growthVelocity), desc(radarArtists.growthScore))
    .limit(40);

  const risers = top
    .filter((a) => Number(a.growthVelocity ?? 0) >= 8)
    .slice(0, 10)
    .map((a) => ({
      id: a.id,
      name: a.name,
      score: Number(a.growthScore ?? 0),
      velocity: Number(a.growthVelocity ?? 0),
      reasons: (a.scoreReasons as string[] | null) ?? [],
    }));

  const newcomers = await db
    .select()
    .from(radarArtists)
    .where(
      and(
        eq(radarArtists.homeGigCount, 0),
        gte(radarArtists.firstSeenAt, since),
        sql`${radarArtists.status} not in ('passed', 'not_relevant')`,
      ),
    )
    .orderBy(desc(radarArtists.growthScore))
    .limit(8)
    .then((rows) =>
      rows.map((a) => ({
        id: a.id,
        name: a.name,
        score: Number(a.growthScore ?? 0),
        reasons: (a.scoreReasons as string[] | null) ?? [],
      })),
    );

  const windowClosing = top
    .filter((a) => {
      const reasons = (a.scoreReasons as string[] | null) ?? [];
      const bookability = Number(a.bookabilityScore ?? 100);
      return (
        reasons.some((r) => /venster sluit/i.test(r)) ||
        (bookability < 45 && Number(a.momentumScore ?? 0) >= 50)
      );
    })
    .slice(0, 8)
    .map((a) => ({
      id: a.id,
      name: a.name,
      score: Number(a.growthScore ?? 0),
      reasons: (a.scoreReasons as string[] | null) ?? [],
    }));

  return { risers, newcomers, windowClosing };
}

function listHtml(
  title: string,
  rows: Array<{ id: string; name: string; score: number; reasons: string[] }>,
) {
  if (!rows.length) {
    return `<h3>${escapeHtml(title)}</h3><p>Geen items deze week.</p>`;
  }
  const origin = baseUrl();
  const items = rows
    .map((r) => {
      const why = r.reasons[0] ? ` — ${escapeHtml(r.reasons[0])}` : "";
      return `<li><a href="${origin}/radar/artiesten/${r.id}">${escapeHtml(r.name)}</a> · score ${r.score}${why}</li>`;
    })
    .join("");
  return `<h3>${escapeHtml(title)}</h3><ol>${items}</ol>`;
}

export async function sendRadarDigest(options?: {
  force?: boolean;
}): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  emailed?: boolean;
  recipients?: string[];
  error?: string;
  payload?: DigestPayload;
}> {
  const settings = await loadRadarSettings();
  if (!settings.digest.enabled && !options?.force) {
    return { ok: true, skipped: true, reason: "digest_disabled" };
  }

  const live = process.env.RADAR_LIVE_DIGEST?.trim() === "true";
  const configured = settings.digest.recipients.filter(Boolean);
  const recipients = live
    ? configured.length
      ? configured
      : [TEST_TO]
    : [TEST_TO];

  const payload = await buildRadarDigest();
  const empty =
    payload.risers.length === 0 &&
    payload.newcomers.length === 0 &&
    payload.windowClosing.length === 0;
  if (empty && !options?.force) {
    return { ok: true, skipped: true, reason: "empty_digest", payload };
  }

  const origin = baseUrl();
  const subject = `${live ? "" : "[TEST] "}Radar digest · ${payload.risers.length} stijgers · ${payload.newcomers.length} nieuw`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2>DJ Talenten Radar</h2>
      <p>Wekelijkse scout-update. Open in de tool: <a href="${origin}/radar/artiesten">${origin}/radar/artiesten</a></p>
      ${listHtml("Top stijgers", payload.risers)}
      ${listHtml("Nieuw op de radar", payload.newcomers)}
      ${listHtml("Venster sluit", payload.windowClosing)}
      ${live ? "" : "<p><em>Testmodus: alleen team@blablabuild.com. Zet RADAR_LIVE_DIGEST=true voor echte ontvangers.</em></p>"}
    </div>
  `;

  const sent = await sendBrevoTransactionalEmail({
    to: recipients,
    subject,
    html,
    sender: alertSender(),
  });
  if (!sent.ok) {
    return { ok: false, error: sent.error, payload, recipients };
  }

  await createRadarAlert({
    kind: "digest",
    title: subject,
    body: `Digest verstuurd naar ${recipients.join(", ")}`,
    payload: {
      ...payload,
      recipients,
      live,
      messageId: sent.messageId,
    },
  });

  // Mark digest alert emailed
  if (hasDatabase()) {
    const db = getDb();
    await db
      .update(radarAlerts)
      .set({ emailedAt: new Date() })
      .where(
        and(eq(radarAlerts.kind, "digest"), isNull(radarAlerts.emailedAt)),
      );
  }

  return {
    ok: true,
    emailed: true,
    recipients,
    payload,
  };
}

/** ISO weekday in Amsterdam: 1=ma … 7=zo */
export function amsterdamIsoWeekday(at: Date = new Date()): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
  }).format(at);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[wd] ?? 1;
}
