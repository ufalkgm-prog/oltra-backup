import "server-only";
import type { CabinClass, CreateOfferRequestPassenger } from "@duffel/api/types";
import { getDuffel } from "@/lib/flights/duffelClient";
import { normalizeOffers } from "@/lib/flights/duffelNormalizer";

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

export async function searchFlightOffers(input: FlightSearchInput) {
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
      return {
        ok: true as const,
        route: `${origin}-${destination}`,
        flies: false,
        options: [],
      };
    }

    // Normalise through the same helper the Flights page uses, then rank by
    // fare and discard the fare. Same principle as checkAvailability: the model
    // can order and compare, but has no figure it could quote.
    const itineraries = normalizeOffers(
      offers,
      input.returnDate ? "return" : "one-way"
    );

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
      route: `${origin}-${destination}`,
      flies: true,
      note: "Ranks only. No fares are provided; the flight cards display live prices.",
      options: ranked.map((itinerary, index) => ({
        priceRank: index + 1,
        outbound: describe(itinerary.outbound),
        inbound: describe(itinerary.inbound),
      })),
    };
  } catch (err) {
    console.error("[ai flightSearch]", err);
    return { ok: false as const, reason: "flight search unavailable" };
  }
}
