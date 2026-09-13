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

  /* WHICH OPTIONS THE MODEL SEES, 2026-09-13.
   *
   * This used to be the six cheapest, which on a real route is often six fare
   * brands of the same one or two flights, some leaving at 06:00 or landing
   * after midnight - so the concierge could say little beyond "it flies". Ulrik
   * wants the answer to name the most relevant options: airlines, direct or
   * not, and the departure times each way, at hours a guest would choose.
   *
   * So: one entry per SCHEDULE (the same flights sold as several fares are one
   * option to a traveller, and the cheapest fare stands for it), each flagged
   * for civilised hours, ordered civilised first, then fewest stops, then
   * shortest, then cheapest. The fare still only survives as a rank. */
  const priced = [...itineraries]
    .filter((it) => Number.isFinite(it.priceEur))
    .sort((a, b) => a.priceEur - b.priceEur);

  type Leg = (typeof priced)[number]["outbound"];
  const signature = (leg: Leg | undefined) =>
    leg ? `${leg.departTime}>${leg.arriveTime}>${leg.airlines.map((a) => a.name).join("+")}>${leg.stops}` : "";
  const bySchedule = new Map<string, (typeof priced)[number]>();
  for (const it of priced) {
    const key = `${signature(it.outbound)}|${signature(it.inbound)}`;
    if (!bySchedule.has(key)) bySchedule.set(key, it);
  }
  const schedules = [...bySchedule.values()];
  const priceRank = new Map(schedules.map((it, index) => [it, index + 1]));

  const totalStops = (it: (typeof priced)[number]) => it.outbound.stops + (it.inbound?.stops ?? 0);
  const totalMinutes = (it: (typeof priced)[number]) =>
    it.outbound.durationMinutes + (it.inbound?.durationMinutes ?? 0);
  const civilised = (it: (typeof priced)[number]) =>
    civilisedHours(it.outbound) && (!it.inbound || civilisedHours(it.inbound));

  const chosen = [...schedules]
    .sort(
      (a, b) =>
        Number(civilised(b)) - Number(civilised(a)) ||
        totalStops(a) - totalStops(b) ||
        totalMinutes(a) - totalMinutes(b) ||
        (priceRank.get(a) ?? 0) - (priceRank.get(b) ?? 0)
    )
    .slice(0, MAX_FLIGHT_OPTIONS);

  const describe = (leg: Leg | undefined) =>
    leg
      ? {
          depart: leg.departTime,
          arrive: leg.arriveTime,
          durationMinutes: leg.durationMinutes,
          stops: leg.stops,
          via: leg.layovers.map((l) => l.name),
          airlines: leg.airlines.map((a) => a.name),
          civilisedHours: civilisedHours(leg),
        }
      : null;

  return {
    ok: true as const,
    route,
    flies: true,
    directAvailable: schedules.some((it) => totalStops(it) === 0),
    note:
      "Most relevant first: civilised hours, then fewest stops, then shortest. " +
      "Times are local. priceRank is 1 for the cheapest schedule; no fares are " +
      "provided - the flight cards display live prices.",
    options: chosen.map((itinerary) => ({
      priceRank: priceRank.get(itinerary) ?? 0,
      outbound: describe(itinerary.outbound),
      inbound: describe(itinerary.inbound),
    })),
  };
}

/* How many schedules the model is given. Enough to offer a morning and an
 * evening choice each way on a well-served route, few enough to stay a shortlist. */
const MAX_FLIGHT_OPTIONS = 8;

/* A guest's hours, not an airline's: leave from 07:00 and land by 23:00 the
 * same day. Both times are local (Duffel's departing_at/arriving_at carry no
 * offset), and a "+1" on the arrival means it lands the next day. A long-haul
 * overnight flight fails this by design and still reaches the model - the flag
 * orders the list, it does not filter it, because on some routes the red-eye is
 * the only way. */
function civilisedHours(leg: { departTime: string; arriveTime: string }): boolean {
  const hour = (time: string) => Number(time.slice(0, 2));
  const nextDay = /\+\d/.test(leg.arriveTime);
  const depart = hour(leg.departTime);
  const arrive = hour(leg.arriveTime);
  return depart >= 7 && !nextDay && arrive < 23;
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
