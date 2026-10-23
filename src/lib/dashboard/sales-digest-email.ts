import type { SalesDigest, SalesDigestEvent } from "@/lib/dashboard/sales-digest";
import { escapeHtml } from "@/lib/integrations/alerts/email";
import { amsterdamDay } from "@/lib/time/amsterdam";

const CREAM = "#f1eee7";
const BLACK = "#000000";
const MUTED = "#555555";
const DIM = "#8a867c";
const WHITE = "#ffffff";
const YELLOW = "#fff201";
const BORDER = "#d2cdc2";
const UP = "#2f6b3a";
const DOWN = "#d22624";

const NARROW = "'Arial Narrow',Arial,Helvetica,sans-serif";
const SANS = "Arial,Helvetica,sans-serif";
const SERIF = "Georgia,Times,'Times New Roman',serif";

/** Public URL for images/links in outbound mail — never localhost. */
function emailPublicBaseUrl(): string {
  const dedicated = process.env.EMAIL_PUBLIC_BASE_URL?.replace(/\/$/, "").trim();
  return dedicated || "https://thuishaven.vercel.app";
}

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatEuro(cents: number): string {
  return euro.format(Math.round(cents / 100));
}

function formatTickets(n: number): string {
  return `${n.toLocaleString("nl-NL")} ${n === 1 ? "ticket" : "tickets"}`;
}

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatHour(d: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatEventDate(d: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function daysUntil(startsAt: Date, now: Date): number {
  const a = Date.parse(`${amsterdamDay(startsAt)}T00:00:00Z`);
  const b = Date.parse(`${amsterdamDay(now)}T00:00:00Z`);
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}

function countdown(startsAt: Date, now: Date): string {
  const days = daysUntil(startsAt, now);
  if (days === 0) return "vandaag! 🪩";
  if (days === 1) return "morgen al";
  if (days > 1) return `nog ${days} dagen`;
  return "geweest";
}

/** "08 NOVEMBER 2026 | THUISHAVEN W/ X & MORE" → "X & MORE"; date staat er apart bij. */
export function shortEventName(name: string): string {
  const parts = name
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^\d{1,2}\s+[A-Z]+(\s+\d{4})?$/i.test(p))
    .filter((p) => !/^THUISHAVEN$/i.test(p))
    .map((p) => p.replace(/^THUISHAVEN\s+W\/\s*/i, ""));
  return parts.join(" · ") || name;
}

function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Stable per day, so a retry sends the same line. */
function pick<T>(items: readonly T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return items[h % items.length]!;
}

const NORMAL_INTROS = [
  "De kassa rinkelde weer. Hier is de stand van de afgelopen 24 uur.",
  "Vers van de pers, nog warm van de scanner.",
  "Je dagelijkse portie cijfers, zonder spreadsheet-gedoe.",
  "Kop koffie erbij? Dit is wat er sinds gisteren 18:00 over de toonbank ging.",
] as const;

const SIGN_OFFS = [
  "Ik tel, jullie feesten.",
  "Morgen om 18:00 ben ik er weer. Beloofd.",
  "Groeten van je favoriete spreadsheet.",
  "Niet antwoorden hoor, ik ben maar een kassa.",
] as const;

function headline(d: SalesDigest): { subject: string; intro: string } {
  const base = `${formatTickets(d.sold)} · ${formatEuro(d.revenueCents)} in 24 uur`;
  if (d.sold === 0) {
    return {
      subject: "🦗 0 tickets in 24 uur — de kassa doet een powernap",
      intro:
        "Nul. Nada. Noppes. De kassa heeft 24 uur naar het plafond gestaard. Morgen beter!",
    };
  }
  if (d.bestOfWeek) {
    return {
      subject: `🔥 ${base}`,
      intro: "De beste 24 uur van de afgelopen week. Iemand een rondje? 🍻",
    };
  }
  const change = pctChange(d.sold, d.soldWeekAgo);
  if (change != null && change >= 15) {
    return {
      subject: `📈 ${base}`,
      intro: "Lekker bezig: we verkopen meer dan vorige week rond deze tijd.",
    };
  }
  if (change != null && change <= -15) {
    return {
      subject: `🎟️ ${base}`,
      intro: "Iets rustiger dan vorige week. Tijd voor een story? 👀",
    };
  }
  return {
    subject: `🎟️ ${base}`,
    intro: pick(NORMAL_INTROS, amsterdamDay(d.windowEnd)),
  };
}

function changeBadge(now: number, before: number): string {
  const change = pctChange(now, before);
  if (change == null) {
    return `<span style="color:${DIM};">vorige week zelfde tijd: ${escapeHtml(formatTickets(before))}</span>`;
  }
  const color = change >= 0 ? UP : DOWN;
  const arrow = change >= 0 ? "▲" : "▼";
  return `<span style="color:${color};font-weight:bold;">${arrow} ${Math.abs(change)}%</span> <span style="color:${DIM};">t.o.v. vorige week (${escapeHtml(formatTickets(before))})</span>`;
}

function eventRow(event: SalesDigestEvent, maxSold: number, now: Date): string {
  const width = Math.max(4, Math.round((event.sold / Math.max(1, maxSold)) * 100));
  return `
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid ${BORDER};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;padding-right:12px;">
                    <p style="margin:0;font-family:${NARROW};font-size:16px;line-height:1.25;letter-spacing:0.02em;color:${BLACK};">${escapeHtml(shortEventName(event.name))}</p>
                    <p style="margin:3px 0 0 0;font-family:${SANS};font-size:12px;color:${DIM};">${escapeHtml(formatEventDate(event.startsAt))} · ${escapeHtml(countdown(event.startsAt, now))}</p>
                  </td>
                  <td style="vertical-align:top;text-align:right;white-space:nowrap;">
                    <p style="margin:0;font-family:${NARROW};font-size:20px;line-height:1.1;color:${BLACK};">${event.sold.toLocaleString("nl-NL")}</p>
                    <p style="margin:3px 0 0 0;font-family:${SANS};font-size:12px;color:${MUTED};">${escapeHtml(formatEuro(event.revenueCents))}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="${width}%" style="height:6px;background:${BLACK};font-size:0;line-height:0;">&nbsp;</td>
                        <td style="height:6px;background:${CREAM};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function renderSalesDigestEmail(
  d: SalesDigest,
  now: Date = new Date(),
): { subject: string; html: string; text: string } {
  const { subject, intro } = headline(d);
  const seed = amsterdamDay(d.windowEnd);
  const signOff = pick(SIGN_OFFS, seed);
  const windowLabel = `${formatWhen(d.windowStart)} – ${formatWhen(d.windowEnd)}`;
  const dashboardUrl = `${emailPublicBaseUrl()}/dashboard/tickets`;
  const maxSold = Math.max(0, ...d.selling.map((e) => e.sold));
  const avg = Math.round(d.avgSoldPrevWeek);

  const busiest =
    d.busiestHour && d.busiestHour.sold > 1
      ? `Drukste uur: <strong>${escapeHtml(formatHour(d.busiestHour.at))}–${escapeHtml(formatHour(new Date(d.busiestHour.at.getTime() + 60 * 60 * 1000)))}</strong> met ${escapeHtml(formatTickets(d.busiestHour.sold))}.`
      : "";
  const average = `Gemiddeld de afgelopen week: ${escapeHtml(formatTickets(avg))} per 24 uur.`;

  const quiet =
    d.quiet.length > 0
      ? `
          <tr>
            <td style="padding:20px 0 0 0;">
              <p style="margin:0 0 6px 0;font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${DIM};">Ook in de verkoop, maar vandaag even stil 🤫</p>
              <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${d.quiet
                .map(
                  (e) =>
                    `${escapeHtml(shortEventName(e.name))} <span style="color:${DIM};">(${escapeHtml(formatEventDate(e.startsAt))})</span>`,
                )
                .join("<br />")}</p>
            </td>
          </tr>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:0 0 20px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="${emailPublicBaseUrl()}/brand/logo-mark.png" width="36" height="36" alt="" style="display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-family:${NARROW};font-size:22px;letter-spacing:0.06em;color:${BLACK};">THUISHAVEN</p>
                    <p style="margin:2px 0 0 0;font-family:${SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${DIM};">De dagelijkse kassa-update</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background:${YELLOW};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:24px 0 6px 0;">
              <p style="margin:0;font-family:${SERIF};font-size:16px;line-height:1.6;color:${MUTED};">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${WHITE};border:1px solid ${BORDER};">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 10px 0;font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${DIM};">${escapeHtml(windowLabel)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:bottom;">
                          <p style="margin:0;font-family:${NARROW};font-size:44px;line-height:1;color:${BLACK};">${d.sold.toLocaleString("nl-NL")}</p>
                          <p style="margin:4px 0 0 0;font-family:${SANS};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${DIM};">tickets</p>
                        </td>
                        <td style="vertical-align:bottom;text-align:right;">
                          <p style="margin:0;font-family:${NARROW};font-size:44px;line-height:1;color:${BLACK};"><span style="background:${YELLOW};padding:0 6px;">${escapeHtml(formatEuro(d.revenueCents))}</span></p>
                          <p style="margin:4px 0 0 0;font-family:${SANS};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${DIM};">ticketomzet</p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.5;">${changeBadge(d.sold, d.soldWeekAgo)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            d.selling.length > 0
              ? `<tr>
            <td style="padding:24px 0 0 0;">
              <p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${DIM};">Per event</p>
            </td>
          </tr>
          ${d.selling.map((e) => eventRow(e, maxSold, now)).join("")}`
              : ""
          }
          ${quiet}
          <tr>
            <td style="padding:20px 0 0 0;">
              <p style="margin:0;font-family:${SERIF};font-size:14px;line-height:1.6;color:${MUTED};">${[busiest, average].filter(Boolean).join(" ")}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 0 28px 0;">
              <a href="${dashboardUrl}" style="display:inline-block;background:${BLACK};color:${WHITE};font-family:${SANS};font-size:13px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:12px 18px;">Open het dashboard</a>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${BORDER};padding:16px 0 0 0;">
              <p style="margin:0 0 4px 0;font-family:${SERIF};font-size:14px;color:${BLACK};">Liefs, De Kassa 🤖</p>
              <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.5;color:${DIM};">${escapeHtml(signOff)} · Bron: Weeztix-orders, elke dag om 18:00.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "THUISHAVEN — De dagelijkse kassa-update",
    "",
    intro,
    "",
    `${windowLabel}: ${formatTickets(d.sold)} · ${formatEuro(d.revenueCents)}`,
    `Vorige week zelfde tijd: ${formatTickets(d.soldWeekAgo)}`,
    "",
    ...d.selling.map(
      (e) =>
        `- ${shortEventName(e.name)} (${formatEventDate(e.startsAt)}): ${formatTickets(e.sold)} · ${formatEuro(e.revenueCents)}`,
    ),
    ...(d.quiet.length > 0
      ? ["", `Even stil: ${d.quiet.map((e) => shortEventName(e.name)).join(", ")}`]
      : []),
    "",
    `Dashboard: ${dashboardUrl}`,
    "",
    `Liefs, De Kassa — ${signOff}`,
  ].join("\n");

  return { subject, html, text };
}
