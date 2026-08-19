/**
 * Harde regel voor externe koppelingen: alleen lezen.
 * Schrijven naar Weeztix/andere vendors is verboden zolang we data verzamelen.
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ReadOnlyViolationError extends Error {
  constructor(method: string, url: string) {
    super(
      `Read-only policy: ${method} naar externe API geblokkeerd (${url}). Alleen GET toegestaan.`,
    );
    this.name = "ReadOnlyViolationError";
  }
}

/** Auth-token endpoints mogen POST (OAuth), vendor-resource APIs niet. */
export function assertExternalReadOnly(
  method: string,
  url: string,
  options?: {
    allowAuthTokenPost?: boolean;
    allowGraphqlReadPost?: boolean;
    allowTransactionalEmailPost?: boolean;
    allowStatisticsReadPost?: boolean;
  },
) {
  const upper = method.toUpperCase();
  if (!WRITE_METHODS.has(upper)) return;

  if (
    options?.allowAuthTokenPost &&
    upper === "POST" &&
    /auth\.weeztix\.com\/tokens\/?$/i.test(url)
  ) {
    return;
  }

  if (
    options?.allowGraphqlReadPost &&
    upper === "POST" &&
    (/^https:\/\/ra\.co\/graphql\/?$/i.test(url) ||
      /^https:\/\/api\.ticketswap\.com\/graphql\/public\/?$/i.test(url))
  ) {
    return;
  }

  if (
    options?.allowStatisticsReadPost &&
    upper === "POST" &&
    /^https:\/\/api\.weeztix\.com\/statistics\/(orders|tickets)\//i.test(url)
  ) {
    return;
  }

  if (
    options?.allowTransactionalEmailPost &&
    upper === "POST" &&
    /^https:\/\/api\.brevo\.com\/v3\/smtp\/email\/?$/i.test(url)
  ) {
    return;
  }

  throw new ReadOnlyViolationError(upper, url);
}
