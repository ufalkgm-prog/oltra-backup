/* ETG's documented maximum stay: 30 nights per search (§32). The search forms
 * used to allow 42. Enforced before any request — in both search forms, the
 * availability routes and the concierge's availability tool — so a longer stay
 * says why rather than failing at the supplier. */
export const MAX_STAY_NIGHTS = 30;

export const STAY_TOO_LONG_MESSAGE = `Stays can be up to ${MAX_STAY_NIGHTS} nights — choose an earlier check-out.`;

/* Nights between two yyyy-mm-dd dates, or null when either is missing or
 * malformed. Parsed as UTC so a daylight-saving change cannot turn 30 nights
 * into 29.96. */
export function stayNights(checkIn: string, checkOut: string): number | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(checkIn) || !iso.test(checkOut)) return null;
  const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(nights) ? nights : null;
}

export function isStayTooLong(checkIn: string, checkOut: string): boolean {
  const nights = stayNights(checkIn, checkOut);
  return nights != null && nights > MAX_STAY_NIGHTS;
}
