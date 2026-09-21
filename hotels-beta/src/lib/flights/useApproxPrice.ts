"use client";

import { useCurrency } from "@/lib/currency/useCurrency";
import { APPROX_PREFIX, roundFlightPrice } from "./priceDisplay";

/* A FARE, IN THE CURRENCY THE MEMBER PICKED.
 *
 * Shared by the Flights page and the landing/concierge flight rows, which used
 * to format fares two different ways: the Flights page converted into the
 * selected currency, and the landing rows printed the fare in whatever
 * currency the supplier quoted. With USD selected the same journey read
 * "USD ~1,140" on one page and "~€1,030" on the other (Ulrik, 2026-09-21).
 *
 * convert() first and format() second, with the display currency passed as the
 * source so format's own conversion is a no-op: rounding the EUR figure and
 * converting afterwards would put 1,237 on screen, which is the one thing the
 * rounding exists to prevent. See priceDisplay.ts for why a fare is written
 * with a ~ at all. */
export function useApproxPrice(): {
  currency: string;
  approx: (priceEur: number, from: string) => string;
} {
  const { currency, convert, format } = useCurrency();
  return {
    currency,
    approx: (priceEur: number, from: string) =>
      `${APPROX_PREFIX}${format(roundFlightPrice(convert(priceEur, from)), currency)}`,
  };
}
