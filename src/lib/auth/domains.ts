/** Hard allowlist for staff auth — same domains as alert ceiling. */
export const AUTH_HARD_DOMAINS = ["thuishaven.nl", "blablabuild.com"] as const;

function parseDomains(raw: string | undefined): string[] {
  const fromEnv = (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  if (!fromEnv.length) return [...AUTH_HARD_DOMAINS];
  return fromEnv.filter((d) =>
    AUTH_HARD_DOMAINS.some((hard) => hard === d),
  );
}

export function allowedAuthDomains(): string[] {
  return parseDomains(process.env.AUTH_ALLOWED_DOMAINS);
}

export function isAllowedAuthEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  const domain = normalized.slice(at + 1);
  return allowedAuthDomains().includes(domain);
}

export function authEmailDomainError(): string {
  return `Alleen ${allowedAuthDomains().map((d) => `@${d}`).join(" en ")} zijn toegestaan.`;
}
