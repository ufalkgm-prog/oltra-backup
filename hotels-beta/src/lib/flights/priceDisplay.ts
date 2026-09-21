/* HOW A FLIGHT FARE IS WRITTEN, and why it is not written exactly.
 *
 * Our fares and Trip.com's come from different sources, and Trip.com is
 * merchant of record — the member pays their figure, not ours. Ours therefore
 * indicates what the journey costs and never quotes what will be charged.
 *
 * That used to be said in a word, "indicative", set beside every fare. It now
 * says itself: a "~" in front of the figure and the figure rounded to the
 * nearest 10 (Ulrik, 2026-09-21). A number ending in a zero with a tilde on it
 * does not read as a quotation in the first place, so nothing has to be
 * explained afterwards — and it takes a character where the label took a line.
 *
 * Rounding happens in the currency the member is reading, never in EUR before
 * conversion: rounding first and converting after produces 1,237 on screen,
 * which is the one thing this is meant to avoid. */

/** To the nearest 10. Pass the amount in the currency it will be shown in. */
export function roundFlightPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value / 10) * 10;
}

/** The "approximately" mark. One definition, so the two pages cannot drift. */
export const APPROX_PREFIX = "~";
