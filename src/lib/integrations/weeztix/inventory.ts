/**
 * Derive remaining from stored capacity. Do not rewrite capacity from
 * sold+available — that identity always holds after a correct sync and
 * previously double-shrunk caps (e.g. 3200 → 195).
 */
export function normalizeWeeztixInventory(input: {
  sold: number | null | undefined;
  capacity: number | null | undefined;
  available: number | null | undefined;
}): { sold: number; capacity: number | null; available: number } {
  const sold = input.sold ?? 0;
  const capacity = input.capacity ?? null;

  if (capacity != null && capacity > 0) {
    return {
      sold,
      capacity,
      available: Math.max(0, capacity - sold),
    };
  }

  return {
    sold,
    capacity: null,
    available: input.available ?? 0,
  };
}
