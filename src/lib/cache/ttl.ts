/**
 * Process-local TTL cache.
 * Complements Next's data cache: same warm instance (dev server, Fluid Compute)
 * can reuse a payload across navigations without rebuilding it.
 */

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export const DASHBOARD_TTL_MS = 2 * 60 * 1000;

export async function rememberTtl<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const task = compute()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

export function clearTtl(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(prefix)) store.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key === prefix || key.startsWith(prefix)) inflight.delete(key);
  }
}
