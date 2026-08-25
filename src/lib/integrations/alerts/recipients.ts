/**
 * Harde poort voor alert-mails.
 *
 * Regels:
 * 1. Ontvangers komen uit een alert-regel of ALERT_NOTIFY_EMAIL — nooit raw
 *    adressen uit een request body zonder deze check.
 * 2. Elk adres moet matchen op ALERT_EMAIL_ALLOWLIST (exact e-mail of @domein).
 * 3. Absolute plafond in code: alleen *@thuishaven.nl en *@blablabuild.com.
 * 4. ALERT_EMAIL_ENABLED moet expliciet "true" zijn, anders wordt er niets verstuurd.
 */

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

function matchesAllowEntry(email: string, entry: string): string | false {
  const e = normalizeEmail(entry);
  if (e.startsWith("@")) {
    return domainOf(email) === e.slice(1) ? email : false;
  }
  return email === e ? email : false;
}

export function isWithinHardDomainCeiling(email: string): boolean {
  const domain = domainOf(normalizeEmail(email));
  return (ALERT_EMAIL_HARD_DOMAINS as readonly string[]).includes(domain);
}

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

export function parseRecipientInput(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeEmail).filter(Boolean);
  }
  return parseList(raw).map(normalizeEmail);
}

/**
 * Filtert een kandidaatlijst door allowlist + hard domeinplafond.
 * Gebruikt door UI-validatie én versturen.
 */
export function gateAlertRecipients(
  candidates: string[],
): ResolvedAlertRecipients {
  const allow = alertEmailAllowlist();
  const blocked: string[] = [];
  const allowed: string[] = [];

  for (const email of candidates.map(normalizeEmail)) {
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

/**
 * Enige plek die bepaalt wie een alert-mail mag krijgen.
 * `requested` = ontvangers van een opgeslagen regel.
 * Zonder requested: fallback naar ALERT_NOTIFY_EMAIL.
 */
export function resolveAlertRecipients(
  requested?: string[],
): ResolvedAlertRecipients {
  if (!isAlertEmailEnabled()) {
    return {
      ok: false,
      error:
        "ALERT_EMAIL_ENABLED staat niet op true — versturen is geblokkeerd.",
    };
  }

  const candidates =
    requested && requested.length > 0
      ? requested.map(normalizeEmail)
      : parseList(process.env.ALERT_NOTIFY_EMAIL).map(normalizeEmail);

  if (candidates.length === 0) {
    return {
      ok: false,
      error: requested
        ? "Geen ontvangers op deze alert"
        : "ALERT_NOTIFY_EMAIL ontbreekt",
    };
  }

  return gateAlertRecipients(candidates);
}

export function alertRecipientMeta() {
  return {
    enabled: isAlertEmailEnabled(),
    allowlist: alertEmailAllowlist(),
    hardDomains: [...ALERT_EMAIL_HARD_DOMAINS],
    fallbackNotify: parseList(process.env.ALERT_NOTIFY_EMAIL),
  };
}
