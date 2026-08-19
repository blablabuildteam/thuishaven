const CREAM = "#f1eee7";
const BLACK = "#000000";
const MUTED = "#555555";
const DIM = "#8a867c";
const WHITE = "#ffffff";
const YELLOW = "#fff201";
const DANGER = "#d22624";
const BORDER = "#d2cdc2";

export type AlertEmailItem = {
  channel: string;
  kind: "overbooking" | "revenue_leak";
  title: string;
  message: string;
};

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://thuishaven.vercel.app"
  );
}

function logoUrl(): string {
  return `${appBaseUrl()}/brand/logo-mark.png`;
}

function alertsUrl(): string {
  return `${appBaseUrl()}/dashboard/alerts`;
}

function kindLabel(kind: AlertEmailItem["kind"]): string {
  return kind === "overbooking" ? "Overboeking" : "Omzetlek";
}

function kindColor(kind: AlertEmailItem["kind"]): string {
  return kind === "overbooking" ? DANGER : "#c9a227";
}

export function renderAlertEmail(input: {
  eyebrow: string;
  title: string;
  intro: string;
  items?: AlertEmailItem[];
  ctaLabel?: string;
  footer?: string;
}): { html: string; text: string } {
  const items = input.items ?? [];
  const cards = items
    .map((item) => {
      const accent = kindColor(item.kind);
      return `
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};background:${WHITE};">
              <tr>
                <td style="width:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding:16px 18px;">
                  <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${DIM};">
                    ${escapeHtml(item.channel)} · ${escapeHtml(kindLabel(item.kind))}
                  </p>
                  <p style="margin:0 0 8px 0;font-family:'Arial Narrow',Arial,Helvetica,sans-serif;font-size:20px;line-height:1.2;letter-spacing:0.02em;color:${BLACK};">
                    ${escapeHtml(item.title)}
                  </p>
                  <p style="margin:0;font-family:Georgia,Times,'Times New Roman',serif;font-size:14px;line-height:1.55;color:${MUTED};">
                    ${escapeHtml(item.message)}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
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
                    <img src="${logoUrl()}" width="36" height="36" alt="" style="display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-family:'Arial Narrow',Arial,Helvetica,sans-serif;font-size:22px;letter-spacing:0.06em;color:${BLACK};">THUISHAVEN</p>
                    <p style="margin:2px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${DIM};">${escapeHtml(input.eyebrow)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background:${YELLOW};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 0 8px 0;">
              <h1 style="margin:0;font-family:'Arial Narrow',Arial,Helvetica,sans-serif;font-size:32px;line-height:1.1;letter-spacing:0.03em;color:${BLACK};">
                ${escapeHtml(input.title)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 24px 0;">
              <p style="margin:0;font-family:Georgia,Times,'Times New Roman',serif;font-size:16px;line-height:1.6;color:${MUTED};">
                ${escapeHtml(input.intro)}
              </p>
            </td>
          </tr>
          ${cards}
          <tr>
            <td style="padding:8px 0 28px 0;">
              <a href="${alertsUrl()}" style="display:inline-block;background:${BLACK};color:${WHITE};font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:12px 18px;">
                ${escapeHtml(input.ctaLabel ?? "Open alerts")}
              </a>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${BORDER};padding:16px 0 0 0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${DIM};">
                ${escapeHtml(input.footer ?? "Thuishaven Tools · sold-out alerts. Primair: Weeztix. Secundair: RA, TicketSwap, Appic.")}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    "THUISHAVEN — " + input.eyebrow,
    "",
    input.title,
    "",
    input.intro,
    "",
    ...items.flatMap((item) => [
      `${item.channel} · ${kindLabel(item.kind)}`,
      item.title,
      item.message,
      "",
    ]),
    `${input.ctaLabel ?? "Open alerts"}: ${alertsUrl()}`,
  ];

  return { html, text: textParts.join("\n") };
}

export function renderTestAlertEmail() {
  return renderAlertEmail({
    eyebrow: "Dashboard alerts · test",
    title: "Testmail sold-out alerts",
    intro:
      "Dit is geen echte mismatch. We checken of alertmails aankomen bij team@blablabuild.com. Bij een echte conflict — Weeztix uitverkocht terwijl RA, TicketSwap of Appic nog open staat — krijg je hier een bericht met link naar het dashboard.",
    items: [
      {
        channel: "Voorbeeld · Resident Advisor",
        kind: "overbooking",
        title: "Weeztix sold-out, RA-shop nog open",
        message:
          "Zo ziet een overboekingsalert eruit. Actie: RA-verkoop uitzetten.",
      },
      {
        channel: "Voorbeeld · TicketSwap",
        kind: "revenue_leak",
        title: "Weeztix sold-out, TicketSwap nog aanbod",
        message:
          "Zo ziet een omzetlek-alert eruit. Actie: secundaire markt checken.",
      },
    ],
    ctaLabel: "Open alerts in dashboard",
    footer:
      "Verstuurd vanuit noreply@thuishaven.nl via Thuishaven Tools. Replies komen niet aan — check het dashboard.",
  });
}

export function renderMismatchAlertEmail(items: AlertEmailItem[]) {
  const n = items.length;
  return renderAlertEmail({
    eyebrow: "Sold-out mismatch",
    title:
      n === 1
        ? "1 secundair kanaal nog actief"
        : `${n} secundaire kanalen nog actief`,
    intro:
      "Weeztix is uitverkocht, maar een secundair kanaal verkoopt nog. RA = overboekingsrisico. TicketSwap / Appic = omzetlek.",
    items,
    ctaLabel: "Bekijk in dashboard",
  });
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
