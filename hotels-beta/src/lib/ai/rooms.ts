/* HOW MANY ROOMS, AND WHEN TO ASK (Ulrik, 2026-09-23). One room for one or two
 * guests, for one adult with one or two children, and for two adults with one
 * child. Any other party of three or more is asked "How many rooms would you
 * need?" - a family of four was priced as two rooms the model chose, which
 * doubles every price on the page. Read by searchHotels and checkAvailability
 * (tools.ts): with no room count for such a party, nothing is priced. */

export const ROOMS_QUESTION = "How many rooms would you need?";

export function mustAskRooms(
  stay: { adults?: number; kids?: number; rooms?: number } | undefined
): boolean {
  if (!stay || (typeof stay.rooms === "number" && stay.rooms > 0)) return false;
  const adults = Math.max(1, stay.adults ?? 2);
  const kids = Math.max(0, stay.kids ?? 0);
  if (adults + kids <= 2) return false;
  if (adults === 1 && kids <= 2) return false;
  if (adults === 2 && kids === 1) return false;
  return true;
}
