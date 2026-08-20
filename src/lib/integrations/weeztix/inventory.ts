/**
 * Weeztix `available_stock` is de toegewezen ticketcap per type (blijft staan
 * bij sold_out). Oudere syncs deden ten onrechte capacity = sold + available.
 * Corrigeer die rijen: cap = oude "available", nog = cap − sold.
 */
export function normalizeWeeztixInventory(input: {
  sold: number | null | undefined;
  capacity: number | null | undefined;
  available: number | null | undefined;
}): { sold: number; capacity: number | null; available: number } {
  const sold = input.sold ?? 0;
  const capacity = input.capacity ?? null;
  const available = input.available ?? 0;

  if (
    capacity != null &&
    available > 0 &&
    capacity === sold + available
  ) {
    const cap = available;
    return {
      sold,
      capacity: cap,
      available: Math.max(0, cap - sold),
    };
  }

  if (capacity != null) {
    return {
      sold,
      capacity,
      available: Math.max(0, capacity - sold),
    };
  }

  return { sold, capacity: null, available };
}
