import { stayNights } from "./stay.ts";

/* WHAT A PRICE COVERS, SAID THE SAME WAY EVERYWHERE (Ulrik, 2026-09-24).
 *
 * Every price we show is a total — never per night, per room or per person —
 * but the cards said only "total stay", or nothing, so a 7-night, 2-room
 * figure read the same as a one-night one. These are the one wording for it:
 * what the total is of. Flights still lead with "Total"; hotels read
 * "2 rooms – 7 nights" (2026-09-27).
 *
 *   hotels:  a rate covers every room searched for the whole stay (§32)
 *   flights: a Duffel offer's total_amount covers every passenger and every
 *            leg of the ticket, so a return is both directions (§7B) */

/** "2 rooms – 7 nights"; "2 rooms" when the nights are unknown.
 *
 * Rooms first, and no "Total" (Ulrik, 2026-09-27): the figure above it is
 * always the whole stay, so the word said nothing the count did not. */
export function hotelPriceBasis(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
  rooms: number | null | undefined
): string {
  const nights = checkIn && checkOut ? stayNights(checkIn, checkOut) : null;
  const roomCount = rooms && rooms > 0 ? rooms : 1;
  const parts = [`${roomCount} ${roomCount === 1 ? "room" : "rooms"}`];
  if (nights && nights > 0) parts.push(`${nights} ${nights === 1 ? "night" : "nights"}`);
  return parts.join(" – ");
}

export type FlightTripKind = "one-way" | "return" | "multi-city";

/** "Total · 3 passengers · return". Lap infants count: they are on the
 * ticket, and priced on it. */
export function flightPriceBasis(
  passengers: FlightParty,
  trip: FlightTripKind
): string {
  return `Total · ${flightPartyLabel(passengers)} · ${trip}`;
}

/** "3 pax · return" — the landing page's flight rows, where the line sits
 * under the row's label beside the price (Ulrik, 2026-09-27). */
export function flightPriceBasisShort(
  passengers: FlightParty,
  trip: FlightTripKind
): string {
  return `${partyCount(passengers)} pax · ${trip}`;
}

type FlightParty = { adults: number; children?: number; infants?: number };

function partyCount(passengers: FlightParty): number {
  return (
    Math.max(0, passengers.adults) +
    Math.max(0, passengers.children ?? 0) +
    Math.max(0, passengers.infants ?? 0)
  );
}

/** "3 passengers" — the part of the basis a heading that already says "Total
 * price" needs on its own. */
export function flightPartyLabel(passengers: FlightParty): string {
  const count = partyCount(passengers);
  return `${count} ${count === 1 ? "passenger" : "passengers"}`;
}
