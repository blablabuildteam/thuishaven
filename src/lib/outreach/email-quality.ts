/**
 * Recipient-address sanity check before a mail is written or sent.
 * `block` = never mail (placeholder, scrape artefact, shared address);
 * `warn` = mailable, but show the reviewer why it may land wrong.
 */

export type EmailIssueCode =
  | "invalid"
  | "placeholder"
  | "noreply"
  | "duplicate"
  | "generic"
  | "free_provider"
  | "other_domain"
  | "name_mismatch";

export type EmailIssue = {
  code: EmailIssueCode;
  level: "block" | "warn";
  label: string;
};

export type EmailQuality = {
  level: "ok" | "warn" | "block";
  issues: EmailIssue[];
};

const PLACEHOLDER_DOMAINS =
  /^(domain|domein|example|voorbeeld|test|email|mail|yourdomain|jouwdomein|bedrijf|company|website|sample)\.(nl|com|org|net|eu|be)$/;
const PLACEHOLDER_LOCALS = new Set([
  "name",
  "naam",
  "voornaam",
  "firstname",
  "first.last",
  "voornaam.achternaam",
  "jouwnaam",
  "yourname",
  "your.name",
  "email",
  "e-mail",
  "voorbeeld",
  "example",
  "test",
  "user",
]);
const FILE_TLDS = /\.(png|jpe?g|gif|svg|webp|css|js)$/;
const NOREPLY = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|bounce)/;
const GENERIC_LOCALS =
  /^(info|contact|hello|hallo|hi|office|kantoor|algemeen|service|support|klantenservice|receptie|reception|administratie|admin|secretariaat|sales|verkoop|marketing|communicatie|pers|press|media|events?|evenementen|hr|jobs|vacatures|werken|careers|finance|facturen|boekhouding|team|mail|post|welkom|bestellingen|orders)([._-].*)?$/;
const FREE_PROVIDERS =
  /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|ziggo|kpnmail|kpnplanet|planet|home|hetnet|xs4all|casema|chello|telfort|upcmail|online|tele2|quicknet|zeelandnet)\.[a-z.]+$/;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  const twoLevel = /^(co|com|org|net|ac|gov)\.[a-z]{2}$/;
  const tail = parts.slice(-2).join(".");
  return twoLevel.test(tail) ? parts.slice(-3).join(".") : tail;
}

function websiteHost(website: string | null | undefined): string | null {
  if (!website?.trim()) return null;
  try {
    const raw = website.trim();
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
}

function stem(base: string): string {
  return base.split(".")[0]!.replace(/[^a-z0-9]/g, "");
}

/** Same brand: shared stem, one stem inside the other, or company name in the mail domain. */
function domainsRelated(
  siteBase: string,
  mailBase: string,
  companyName: string | null | undefined,
): boolean {
  if (siteBase === mailBase) return true;
  const a = stem(siteBase);
  const b = stem(mailBase);
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  const words = normalize(companyName ?? "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  return words.some((w) => b.includes(w));
}

export function isGenericLocalPart(email: string): boolean {
  return GENERIC_LOCALS.test(normalize(email.split("@")[0] ?? ""));
}

/** True when a personal-looking address clearly belongs to someone else. */
export function contactNameMismatch(
  email: string,
  contactName: string | null | undefined,
): boolean {
  if (!contactName?.trim()) return false;
  const local = normalize(email.split("@")[0] ?? "");
  if (!local || isGenericLocalPart(email)) return false;
  const letters = local.replace(/[^a-z]/g, "");
  const tokens = normalize(contactName)
    .split(/[\s\-']+/)
    .filter((t) => t.length >= 3 && !["van", "der", "den", "de"].includes(t));
  if (tokens.length === 0) return false;
  return !tokens.some((t) => letters.includes(t.replace(/[^a-z]/g, "")));
}

export function checkRecipientEmail(input: {
  email: string | null | undefined;
  contactName?: string | null;
  website?: string | null;
  companyName?: string | null;
  /** How many prospects (incl. this one) share this exact address. */
  sharedCount?: number;
}): EmailQuality {
  const issues: EmailIssue[] = [];
  const email = input.email?.trim().toLowerCase() ?? "";
  const [local = "", domain = ""] = email.split("@");

  if (!EMAIL_RE.test(email) || FILE_TLDS.test(domain)) {
    issues.push({ code: "invalid", level: "block", label: "Ongeldig adres" });
  } else if (PLACEHOLDER_DOMAINS.test(domain) || PLACEHOLDER_LOCALS.has(local)) {
    issues.push({
      code: "placeholder",
      level: "block",
      label: "Voorbeeldadres",
    });
  } else if (NOREPLY.test(local)) {
    issues.push({ code: "noreply", level: "block", label: "No-reply adres" });
  }

  if ((input.sharedCount ?? 1) > 1) {
    issues.push({
      code: "duplicate",
      level: "block",
      label: `Zelfde adres bij ${input.sharedCount} bedrijven`,
    });
  }

  if (issues.some((i) => i.level === "block")) {
    return { level: "block", issues };
  }

  if (isGenericLocalPart(email)) {
    issues.push({ code: "generic", level: "warn", label: "Algemeen adres" });
  }
  if (FREE_PROVIDERS.test(domain)) {
    issues.push({ code: "free_provider", level: "warn", label: "Privé-adres" });
  } else {
    const host = websiteHost(input.website);
    if (host && !domainsRelated(baseDomain(host), baseDomain(domain), input.companyName)) {
      issues.push({
        code: "other_domain",
        level: "warn",
        label: "Ander domein dan website",
      });
    }
  }
  if (contactNameMismatch(email, input.contactName)) {
    issues.push({
      code: "name_mismatch",
      level: "warn",
      label: "Naam past niet bij adres",
    });
  }

  return { level: issues.length > 0 ? "warn" : "ok", issues };
}

/** Name to greet with — dropped when the address belongs to someone else. */
export function greetingContactName(
  email: string | null | undefined,
  contactName: string | null | undefined,
): string | undefined {
  if (!contactName?.trim()) return undefined;
  if (email && contactNameMismatch(email, contactName)) return undefined;
  return contactName.trim();
}

export function blockedEmailReason(quality: EmailQuality): string | null {
  const block = quality.issues.find((i) => i.level === "block");
  return block ? `Adres niet mailen: ${block.label.toLowerCase()}` : null;
}
