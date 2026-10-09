/**
 * Vaste afzender-profielen voor outreach-bakjes.
 * From/reply-to moeten in Brevo als goedgekeurde senders staan
 * én in outreach_settings.allowed_sender_emails.
 */

export type OutreachSenderProfileId =
  | "evenementen"
  | "reiner"
  | "yoram";

export type OutreachSenderProfile = {
  id: OutreachSenderProfileId;
  /** Korte label in UI (bakje-keuze). */
  label: string;
  /** From e-mail */
  email: string;
  /** From display name */
  name: string;
  replyToEmail: string;
  replyToName: string;
  /** Plain-text handtekening onder de mail. */
  signature: string;
};

export const OUTREACH_SENDER_PROFILES: readonly OutreachSenderProfile[] = [
  {
    id: "evenementen",
    label: "Evenementen",
    email: "evenement@thuishaven.nl",
    name: "Thuishaven Evenementen",
    replyToEmail: "evenement@thuishaven.nl",
    replyToName: "Thuishaven Evenementen",
    signature: `Thuishaven Evenementen
Festival locatie voor zakelijke events
evenement@thuishaven.nl
Contactweg 68, 1014 BW Amsterdam
thuishavenb2b.nl`,
  },
  {
    id: "reiner",
    label: "Via Reijner",
    email: "reijner@thuishaven.nl",
    name: "Reijner · Thuishaven",
    replyToEmail: "reijner@thuishaven.nl",
    replyToName: "Reijner · Thuishaven",
    signature: `Reijner
Thuishaven
Festival locatie voor zakelijke events
reijner@thuishaven.nl · +31 6 83 63 37 25
Contactweg 68, 1014 BW Amsterdam
thuishavenb2b.nl`,
  },
  {
    id: "yoram",
    label: "Via Yoram",
    email: "yoram@thuishaven.nl",
    name: "Yoram · Thuishaven",
    replyToEmail: "yoram@thuishaven.nl",
    replyToName: "Yoram · Thuishaven",
    signature: `Yoram
Thuishaven
Festival locatie voor zakelijke events
yoram@thuishaven.nl
Contactweg 68, 1014 BW Amsterdam
thuishavenb2b.nl`,
  },
] as const;

export const DEFAULT_SENDER_PROFILE_ID: OutreachSenderProfileId = "reiner";

/** Alle From-adressen die standaard in de allowlist horen. */
export const DEFAULT_ALLOWED_SENDER_EMAILS: string[] = [
  ...new Set([
    ...OUTREACH_SENDER_PROFILES.map((p) => p.email),
    // Legacy / aliases die al in omloop waren
    "zakelijk@thuishaven.nl",
    "evenement@thuishaven.nl",
  ]),
];

export function isSenderProfileId(
  value: unknown,
): value is OutreachSenderProfileId {
  return (
    value === "evenementen" || value === "reiner" || value === "yoram"
  );
}

export function getSenderProfile(
  id: string | null | undefined,
): OutreachSenderProfile {
  const found = OUTREACH_SENDER_PROFILES.find((p) => p.id === id);
  return (
    found ??
    OUTREACH_SENDER_PROFILES.find((p) => p.id === DEFAULT_SENDER_PROFILE_ID)!
  );
}

export function senderProfileLabel(id: string | null | undefined): string {
  return getSenderProfile(id).label;
}

/** Snapshot to store on a batch (survives later profile edits). */
export function snapshotSenderProfile(id: OutreachSenderProfileId): {
  senderProfileId: OutreachSenderProfileId;
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  replyToName: string;
} {
  const p = getSenderProfile(id);
  return {
    senderProfileId: p.id,
    senderEmail: p.email,
    senderName: p.name,
    replyToEmail: p.replyToEmail,
    replyToName: p.replyToName,
  };
}

/**
 * Strip known outreach signatures and append the profile signature.
 * Used at send-time so From + handtekening bij dezelfde persoon horen.
 */
export function applySenderSignature(
  body: string,
  profile: OutreachSenderProfile,
): string {
  let trimmed = body.replace(/\r\n/g, "\n").trim();
  // Drop trailing generic closings that collide with signatures.
  trimmed = trimmed.replace(
    /\n*(Groet|Groeten|Met vriendelijke groet|Cheers)[,!]?\s*\n*Thuishaven Events\s*$/i,
    "",
  );

  for (const p of OUTREACH_SENDER_PROFILES) {
    const marker = p.signature.split("\n")[0]?.trim();
    if (!marker) continue;
    const idx = trimmed.lastIndexOf(`\n\n${marker}`);
    if (idx >= 0) {
      const tail = trimmed.slice(idx + 2);
      if (tail.startsWith(marker)) {
        trimmed = trimmed.slice(0, idx).trimEnd();
      }
    }
    // Also handle signature glued without blank line after last paragraph.
    const idx2 = trimmed.lastIndexOf(`\n${marker}\n`);
    if (idx2 >= 0 && /Festival locatie voor zakelijke events/i.test(trimmed.slice(idx2))) {
      trimmed = trimmed.slice(0, idx2).trimEnd();
    }
  }

  // Legacy "Reiner" spelling in older drafts (display name is Reijner)
  const legacyIdx = trimmed.lastIndexOf("\n\nReiner\n");
  if (
    legacyIdx >= 0 &&
    /Festival locatie voor zakelijke events/i.test(trimmed.slice(legacyIdx))
  ) {
    trimmed = trimmed.slice(0, legacyIdx).trimEnd();
  }

  if (
    trimmed.endsWith(profile.signature) ||
    (trimmed.includes(profile.signature.split("\n")[0]!) &&
      /Festival locatie voor zakelijke events/i.test(trimmed.slice(-220)))
  ) {
    return trimmed;
  }

  return `${trimmed}\n\n${profile.signature}`;
}
