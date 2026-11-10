/** Small retry helper for flaky DB / RA calls. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { tries?: number; backoffMs?: number },
): Promise<T> {
  const tries = options?.tries ?? 3;
  const backoffMs = options?.backoffMs ?? 500;
  let last: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === tries - 1) break;
      await new Promise((r) => setTimeout(r, backoffMs * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
