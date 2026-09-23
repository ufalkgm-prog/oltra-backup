import type { AiFlightLeg, AiHotelCard } from "./types";

/** Most properties the concierge panel will ever read out, however many the
 * model wrote lines for - hotels and restaurants each. Five since 2026-09-23
 * (Ulrik; it was eight): past that the panel stops being something anyone
 * takes in, and the page behind is where a set is browsed - it still carries
 * every card. Exported because the
 * landing frames complete their flight legs from the same named set, and two
 * copies of this number would agree only until one changed. */
export const MAX_NAMED = 5;

/** The hotels the panel names: the ones the model wrote a line for, in its
 * order, or the first few when it wrote none. */
export function namedHotels<T extends { id: number | string }>(
  hotels: T[],
  highlightIds: number[]
): T[] {
  if (!highlightIds.length) return hotels.slice(0, MAX_NAMED);
  const wanted = new Set(highlightIds.map(String));
  const picked = hotels.filter((hotel) => wanted.has(String(hotel.id)));
  return (picked.length ? picked : hotels).slice(0, MAX_NAMED);
}

/* ONE ANSWER, SEVERAL AIRPORTS (Ulrik, 2026-09-14).
 *
 * Asked for the best waterfront hotels in Spain for given dates, the concierge
 * named six hotels across Ibiza, Mallorca, Barcelona and the Andalusian coast,
 * said in the framing which airport served which, and then presented ONE
 * flight — Copenhagen to Ibiza — closing with an offer to "price the flights to
 * Málaga, Barcelona or Palma instead". Four airports mentioned, one flown to.
 *
 * What was wanted: every hotel line names the airport that hotel is reached
 * through, and the flights below cover every one of those airports. The prompt
 * now asks for that, and searchFlights can take several airports in one call —
 * but §50's record is that a rule of this shape gets skipped, so the display
 * completes it rather than trusting it was read:
 *
 *  - the airport under each hotel comes from our data (the hotel's standing
 *    gateway order, attached by /api/ai/hotels), never from the model;
 *  - any airport a named hotel needs that no presented leg flies to gets a leg
 *    added, copying the first leg's origin, dates and cabin. It carries no
 *    `details` — the panel shows options only for a journey actually searched
 *    — but the flight frame behind searches it live like any other leg.
 *
 * Pure functions, in their own file, because the model's output feeds them. */

/** The airport a hotel line should name: the first of the hotel's airports
 * that a presented leg flies to, so a hotel reachable through two airports
 * names the one the flights cover; otherwise its standing first choice. */
export function gatewayForHotel(
  hotel: Pick<AiHotelCard, "airports">,
  legs: AiFlightLeg[]
): { iata: string; label: string } | null {
  const airports = hotel.airports ?? [];
  if (!airports.length) return null;
  const flown = new Set(legs.map((leg) => leg.destination.trim().toUpperCase()));
  return airports.find((a) => flown.has(a.iata)) ?? airports[0];
}

/** The presented legs, plus one per airport the named hotels need and no leg
 * covers, ordered to follow the hotels.
 *
 * Only completes an OUTBOUND set - every leg leaving the same origin on the
 * same dates, which is what "hotels in several places, flights to each" looks
 * like. An open-jaw itinerary (into one city, home from another) is a route
 * the visitor described, and adding legs to it would rewrite their trip. */
export function completeLegsForHotels(
  legs: AiFlightLeg[],
  hotels: Pick<AiHotelCard, "airports">[],
  maxLegs: number,
  /* Every hotel the answer presented, given only when the flights came in the
     same answer as those hotels. A presented leg to an airport none of them
     uses is then dropped: the family ski answer searched Zurich for Suvretta
     House, left Suvretta out, and still listed Heathrow-Zurich (2026-09-15). */
  presentedHotels?: Pick<AiHotelCard, "airports">[]
): AiFlightLeg[] {
  if (!legs.length || !hotels.length) return legs;

  const first = legs[0];
  const sameTrip = legs.every(
    (leg) =>
      leg.origin === first.origin &&
      leg.departureDate === first.departureDate &&
      (leg.returnDate ?? "") === (first.returnDate ?? "")
  );
  if (!sameTrip) return legs;

  const byDestination = new Map(legs.map((leg) => [leg.destination.trim().toUpperCase(), leg]));
  const ordered: AiFlightLeg[] = [];
  const placed = new Set<string>();

  for (const hotel of hotels) {
    const gateway = gatewayForHotel(hotel, legs);
    if (!gateway || placed.has(gateway.iata)) continue;
    if (gateway.iata === first.origin.trim().toUpperCase()) continue;
    placed.add(gateway.iata);
    ordered.push(
      byDestination.get(gateway.iata) ?? {
        origin: first.origin,
        destination: gateway.iata,
        departureDate: first.departureDate,
        returnDate: first.returnDate,
        cabin: first.cabin,
      }
    );
  }

  // Legs the model presented that no named hotel accounts for keep their place
  // at the end rather than being dropped: it had a reason to show them.
  const presentedAirports =
    presentedHotels?.length && presentedHotels.every((hotel) => hotel.airports?.length)
      ? new Set(presentedHotels.flatMap((hotel) => (hotel.airports ?? []).map((a) => a.iata)))
      : null;
  for (const leg of legs) {
    const destination = leg.destination.trim().toUpperCase();
    if (placed.has(destination)) continue;
    if (presentedAirports && !presentedAirports.has(destination)) continue;
    ordered.push(leg);
  }

  return ordered.slice(0, Math.max(maxLegs, legs.length));
}
