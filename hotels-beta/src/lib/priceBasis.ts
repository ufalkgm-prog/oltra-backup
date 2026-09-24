import { stayNights } from "./stay.ts";

/* WHAT A PRICE COVERS, SAID THE SAME WAY EVERYWHERE (Ulrik, 2026-09-24).
 *
 * Every price we show is a total — never per night, per room or per person —
 * but the cards said only "total stay", or nothing, so a 7-night, 2-room
 * figure read the same as a one-night one. These are the one wording for it,
 * hotel and flight alike: "Total", then what the total is of.
 *
 *   hotels:  a rate covers every room searched for the whole stay (§32)
 *   flights: a Duffel offer's total_amount covers every passenger and every
 *            leg of the ticket, so a return is both directions (§7B) */

/** "Total · 7 nights · 2 rooms"; "Total stay" when the nights are unknown. */
export function hotelPriceBasis(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
  rooms: number | null | undefined
): string {
  const nights = checkIn && checkOut ? stayNights(checkIn, checkOut) : null;
  const roomCount = rooms && rooms > 0 ? rooms : 1;
  const parts = ["Total"];
  if (nights && nights > 0) parts.push(`${nights} ${nights === 1 ? "night" : "nights"}`);
  else parts[0] = "Total stay";
  parts.push(`${roomCount} ${roomCount === 1 ? "room" : "rooms"}`);
  return parts.join(" · ");
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

type FlightParty = { adults: number; children?: number; infants?: number };

/** "3 passengers" — the part of the basis a heading that already says "Total
 * price" needs on its own. */
export function flightPartyLabel(passengers: FlightParty): string {
  const count =
    Math.max(0, passengers.adults) +
    Math.max(0, passengers.children ?? 0) +
    Math.max(0, passengers.infants ?? 0);
  return `${count} ${count === 1 ? "passenger" : "passengers"}`;
}
