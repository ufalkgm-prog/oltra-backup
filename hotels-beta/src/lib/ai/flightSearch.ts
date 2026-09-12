import "server-only";
import type { CabinClass, CreateOfferRequestPassenger } from "@duffel/api/types";
import { getDuffel } from "@/lib/flights/duffelClient";
import { normalizeOffers } from "@/lib/flights/duffelNormalizer";
import { factsFromDurations, type GatewayFlightFacts } from "@/lib/flights/gatewayRanking";

/* Route check for the concierge.
 *
 * Deliberately its own thin wrapper rather than an HTTP call to
 * /api/flights/search: that route exists to serve the browser and returns raw
 * Duffel offers, which are large and full of fare amounts. Here we normalise
 * once and strip every figure before the model sees anything — same rule as
 * checkAvailability. The model gets routing, timing and an ordinal; the flight
 * cards fetch and display the real fares themselves. */

const CABIN_MAP: Record<string, CabinClass> = {
  economy: "economy",
  premium_economy: "premium_economy",
  business: "business",
  first: "first",
};

export type FlightSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  cabinClass?: string;
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/* One Duffel search, normalised, with nothing stripped yet. Both exported
 * functions below build on it: `searchFlightOffers` ranks by fare and throws
 * the fare away, `gatewayFlightFacts` reads the quickest leg. Neither can be
 * written on top of the other - the fare-ranked list is cut to six options, and
 * the quickest itinerary is routinely not among the six cheapest, so measuring
 * "fastest" off that list answers a different question than the one asked. */
async function fetchItineraries(input: FlightSearchInput) {
  const origin = input.origin.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return { ok: false as const, reason: "origin and destination must be IATA codes" };
  }
  if (!isIsoDate(input.departureDate)) {
    return { ok: false as const, reason: "departureDate must be yyyy-mm-dd" };
  }
  if (input.returnDate && !isIsoDate(input.returnDate)) {
    return { ok: false as const, reason: "returnDate must be yyyy-mm-dd" };
  }

  const adults = Math.min(9, Math.max(1, input.adults ?? 1));
  const children = Math.min(8, Math.max(0, input.children ?? 0));

  const passengers: CreateOfferRequestPassenger[] = [
    ...Array.from({ length: adults }, () => ({ type: "adult" as const })),
    ...Array.from({ length: children }, () => ({ age: 10 })),
  ];

  const slices = [
    {
      origin,
      destination,
      departure_date: input.departureDate,
      arrival_time: null,
      departure_time: null,
    },
    ...(input.returnDate
      ? [
          {
            origin: destination,
            destination: origin,
            departure_date: input.returnDate,
            arrival_time: null,
            departure_time: null,
          },
        ]
      : []),
  ];

  try {
    const duffel = getDuffel();
    const response = await duffel.offerRequests.create({
      slices,
      passengers,
      cabin_class: CABIN_MAP[input.cabinClass ?? "economy"] ?? "economy",
      return_offers: true,
    });

    const offers = response.data.offers ?? [];
    if (!offers.length) {
      return { ok: true as const, route: `${origin}-${destination}`, itineraries: [] };
    }

    // Normalise through the same helper the Flights page uses.
    const itineraries = normalizeOffers(
      offers,
      input.returnDate ? "return" : "one-way"
    );
    return { ok: true as const, route: `${origin}-${destination}`, itineraries };
  } catch (err) {
    console.error("[ai flightSearch]", err);
    return { ok: false as const, reason: "flight search unavailable" };
  }
}

export async function searchFlightOffers(input: FlightSearchInput) {
  const found = await fetchItineraries(input);
  if (!found.ok) return found;
  const { route, itineraries } = found;
  if (!itineraries.length) {
    return { ok: true as const, route, flies: false, options: [] };
  }

  // Rank by fare and discard the fare. Same principle as checkAvailability:
  // the model can order and compare, but has no figure it could quote.
  const ranked = [...itineraries]
    .filter((it) => Number.isFinite(it.priceEur))
    .sort((a, b) => a.priceEur - b.priceEur)
    .slice(0, 6);

  const describe = (leg: (typeof ranked)[number]["outbound"] | undefined) =>
    leg
      ? {
          depart: leg.departTime,
          arrive: leg.arriveTime,
          durationMinutes: leg.durationMinutes,
          stops: leg.stops,
          via: leg.layovers.map((l) => l.name),
          airlines: leg.airlines.map((a) => a.name),
        }
      : null;

  return {
    ok: true as const,
    route,
    flies: true,
    note: "Ranks only. No fares are provided; the flight cards display live prices.",
    options: ranked.map((itinerary, index) => ({
      priceRank: index + 1,
      outbound: describe(itinerary.outbound),
      inbound: describe(itinerary.inbound),
    })),
  };
}

/* HOW LONG IT TAKES TO FLY THERE, per candidate airport, with no fare in the
 * result at all.
 *
 * This is the input to `gatewayRanking.ts`, and it is deliberately a different
 * function from `searchFlightOffers` above rather than a flag on it: that one
 * answers "what are the options on this route", this one answers "how quickly
 * can you reach each of these airports", and the second is the only question
 * that can rank a gateway. Both strip every amount before returning.
 *
 * The searches run in PARALLEL. A destination has at most six candidate
 * airports (London) and typically one to three, so the wall-clock cost is one
 * search rather than three - which is what makes this affordable to call before
 * naming an airport. */
export async function gatewayFlightFacts(input: {
  origin: string;
  destinations: string[];
  departureDate: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  cabinClass?: string;
}): Promise<Record<string, GatewayFlightFacts>> {
  const results = await Promise.all(
    input.destinations.map(async (destination) => {
      const found = await fetchItineraries({ ...input, destination });
      if (!found.ok || !found.itineraries.length) {
        return [
          destination,
          { flies: false, fastestMinutes: null, fastestNonstopMinutes: null, minStops: null },
        ] as const;
      }
      /* The OUTBOUND leg decides which airport you arrive at, so it is the leg
       * that carries the transfer. A return's inbound duration belongs to the
       * fare comparison the cards already make, not to this. */
      const legs = found.itineraries.map((itinerary) => itinerary.outbound).filter(Boolean);
      if (!legs.length) {
        return [
          destination,
          { flies: true, fastestMinutes: null, fastestNonstopMinutes: null, minStops: null },
        ] as const;
      }
      /* One helper for both, so the nonstop figure cannot be derived a
       * different way from the overall one. */
      return [destination, factsFromDurations(legs.map((leg) => ({ minutes: leg.durationMinutes, stops: leg.stops })))] as const;
    })
  );
  return Object.fromEntries(results);
}
