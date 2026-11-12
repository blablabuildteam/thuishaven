/**
 * Parse RA bookingDetails into a usable booking contact.
 * Important signal: agency = usually more expensive / less direct.
 */

const PERSONAL_EMAIL =
  /@(gmail|googlemail|hotmail|outlook|live|icloud|me|yahoo|proton\.?mail|ziggo|xs4all|hetnet|kpnmail)\./i;

const AGENCY_HINT =
  /\b(agency|agencies|booking|bookings|management|manager|bureau|artists? agency|talent)\b/i;

const AGENCY_DOMAIN =
  /\b[\w.-]*(agency|booking|management|artists?|talent|music|manager)[\w.-]*\.[a-z]{2,}\b/i;

export type ParsedBooking = {
  raw: string;
  /** Best-effort bureau name, e.g. "Frameworks Agency". */
  agencyName: string | null;
  emails: string[];
  urls: string[];
  /** True if this looks like a real bureau, not only a private mail. */
  isAgency: boolean;
};

function extractEmails(text: string): string[] {
  const normalized = text.replace(/\[at\]/gi, "@").replace(/\s*\(at\)\s*/gi, "@");
  const found = normalized.match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  );
  if (!found) return [];
  return [...new Set(found.map((e) => e.toLowerCase()))].slice(0, 6);
}

function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi);
  if (!found) return [];
  return [...new Set(found)].slice(0, 4);
}

function guessAgencyName(text: string, emails: string[]): string | null {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.includes("@") || /^https?:/i.test(line)) continue;
    if (/^(bookings?|management|contact)\b/i.test(line) && line.length < 20) {
      continue;
    }
    const cleaned = line
      .replace(/^(bookings?|management|contact)\s*[:|-]\s*/i, "")
      .trim();
    if (
      cleaned.length >= 3 &&
      cleaned.length <= 60 &&
      /[A-Za-z]/.test(cleaned) &&
      (AGENCY_HINT.test(cleaned) || /[A-Z]/.test(cleaned[0]!))
    ) {
      if (AGENCY_HINT.test(cleaned) || /agency|booking|management/i.test(cleaned)) {
        return cleaned.slice(0, 60);
      }
    }
  }

  for (const line of lines) {
    if (AGENCY_HINT.test(line) && !line.includes("@") && line.length <= 60) {
      return line.replace(/^(bookings?|management)\s*[:|-]\s*/i, "").slice(0, 60);
    }
  }

  for (const email of emails) {
    if (PERSONAL_EMAIL.test(email)) continue;
    const domain = email.split("@")[1];
    if (!domain) continue;
    const base = domain.split(".")[0] ?? "";
    if (base.length < 3) continue;
    // frameworks-agency → Frameworks Agency
    const pretty = base
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (AGENCY_HINT.test(pretty) || AGENCY_DOMAIN.test(domain)) return pretty;
  }

  return null;
}

export function parseBookingDetails(
  raw: string | null | undefined,
): ParsedBooking | null {
  const text = raw?.trim();
  if (!text) return null;

  const emails = extractEmails(text);
  const urls = extractUrls(text);
  const agencyName = guessAgencyName(text, emails);

  const hasAgencyKeyword = AGENCY_HINT.test(text) || AGENCY_DOMAIN.test(text);
  const hasAgencyEmail = emails.some((e) => !PERSONAL_EMAIL.test(e));
  const onlyPersonal =
    emails.length > 0 && emails.every((e) => PERSONAL_EMAIL.test(e));

  const isAgency =
    Boolean(agencyName) ||
    hasAgencyKeyword ||
    (hasAgencyEmail && !onlyPersonal) ||
    (urls.length > 0 && AGENCY_HINT.test(text));

  // Pure personal gmail / bio without bureau cues → not an agency
  if (onlyPersonal && !hasAgencyKeyword && !agencyName) {
    return { raw: text, agencyName: null, emails, urls, isAgency: false };
  }

  return {
    raw: text,
    agencyName,
    emails,
    urls,
    isAgency,
  };
}

export function detectHasAgency(bookingDetails: string | null | undefined): boolean {
  return parseBookingDetails(bookingDetails)?.isAgency ?? false;
}
