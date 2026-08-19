/**
 * Harde poort voor alert-mails.
 *
 * Regels:
 * 1. Ontvangers komen ALLEEN uit ALERT_NOTIFY_EMAIL (env) — nooit uit request body of functie-args.
 * 2. Elk adres moet matchen op ALERT_EMAIL_ALLOWLIST (exact e-mail of @domein).
 * 3. Absolute plafond in code: alleen *@thuishaven.nl en *@blablabuild.com — ook als env anders zegt.
 * 4. ALERT_EMAIL_ENABLED moet expliciet "true" zijn, anders wordt er niets verstuurd.
 */

/** Domeinen die überhaupt alert-mail mogen ontvangen. Code-plafond, niet via env te verruimen. */
export const ALERT_EMAIL_HARD_DOMAINS = [
  "thuishaven.nl",
  "blablabuild.com",
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function matchesAllowEntry(email: string, entry: string): boolean {
  const e = normalizeEmail(entry);
  if (e.startsWith("@")) {
    return domainOf(email) === e.slice(1);
  }
  return email === e;
}

/** Absolute plafond: alleen toegestane domeinen. */
export function isWithinHardDomainCeiling(email: string): boolean {
  const domain = domainOf(normalizeEmail(email));
  return (ALERT_EMAIL_HARD_DOMAINS as readonly string[]).includes(domain);
}

/**
 * Allowlist uit env, of veilige default (alleen team@blablabuild.com)
 * zolang ALERT_EMAIL_ALLOWLIST leeg is.
 */
export function alertEmailAllowlist(): string[] {
  const fromEnv = parseList(process.env.ALERT_EMAIL_ALLOWLIST).map(normalizeEmail);
  if (fromEnv.length > 0) return fromEnv;
  return ["team@blablabuild.com"];
}

export function isAlertEmailEnabled(): boolean {
  return process.env.ALERT_EMAIL_ENABLED?.trim().toLowerCase() === "true";
}

export type ResolvedAlertRecipients =
  | { ok: true; to: string[] }
  | { ok: false; error: string; blocked?: string[] };

/**
 * Enige plek die bepaalt wie alert-mails mag krijgen.
 * Accepteert géén externe ontvangerslijst.
 */
export function resolveAlertRecipients(): ResolvedAlertRecipients {
  if (!isAlertEmailEnabled()) {
    return {
      ok: false,
      error:
        "ALERT_EMAIL_ENABLED staat niet op true — versturen is geblokkeerd.",
    };
  }

  const configured = parseList(process.env.ALERT_NOTIFY_EMAIL).map(normalizeEmail);
  if (configured.length === 0) {
    return { ok: false, error: "ALERT_NOTIFY_EMAIL ontbreekt" };
  }

  const allow = alertEmailAllowlist();
  const blocked: string[] = [];
  const allowed: string[] = [];

  for (const email of configured) {
    if (!EMAIL_RE.test(email)) {
      blocked.push(email);
      continue;
    }
    if (!isWithinHardDomainCeiling(email)) {
      blocked.push(email);
      continue;
    }
    if (!allow.some((entry) => matchesAllowEntry(email, entry))) {
      blocked.push(email);
      continue;
    }
    if (!allowed.includes(email)) allowed.push(email);
  }

  if (blocked.length > 0) {
    return {
      ok: false,
      error: `Geblokkeerd (buiten allowlist/plafond): ${blocked.join(", ")}`,
      blocked,
    };
  }
  if (allowed.length === 0) {
    return { ok: false, error: "Geen geldige ontvangers na allowlist-check" };
  }

  return { ok: true, to: allowed };
}
