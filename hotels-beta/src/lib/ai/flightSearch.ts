import "server-only";
import { factsFromDurations, type GatewayFlightFacts } from "@/lib/flights/gatewayRanking";
import { sharedAlliance, type Alliance } from "@/lib/flights/airlineAlliances";
import { toCabin } from "@/lib/flights/itinerary";
import { flightPassengers } from "@/lib/flights/passengers";
import { duffelConnector } from "@/lib/flights/providers/duffel";
import type { PreferredAirline } from "./preferredAirlines";

/* Route check for the concierge.
 *
 * Deliberately its own thin wrapper rather than an HTTP call to
 * /api/flights/search: that route exists to serve the browser and returns raw
 * Duffel offers, which are large and full of fare amounts. Here we normalise
 * once and strip every figure before the model sees anything — same rule as
 * checkAvailability. The model gets routing, timing and an ordinal; the flight
 * cards fetch and display the real fares themselves.
 *
 * WHICH SUPPLIER THIS ASKS IS NOT THIS FILE'S BUSINESS. It used to be: the
 * cabin map, the passenger array and the slice objects below were Duffel's
 * request format, written into the concierge's own layer. They now live in
 * `lib/flights/providers/duffel.ts` behind `FlightConnector`, so the one line
 * to change when the supplier changes is the import. Everything from
 * `itineraries` down reads our shape and would not notice. */

export type FlightSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  /** Each child's age: under-2s fly as lap infants (lib/flights/passengers.ts). */
  childrenAges?: number[];
  cabinClass?: string;
  /** Keep only options flown entirely within this alliance. */
  alliance?: Alliance;
};

const ALLIANCE_NAMES: Record<Alliance, string> = {
  star: "Star Alliance",
  oneworld: "oneworld",
  skyteam: "SkyTeam",
};

/* The test token's own carrier (2026-09-24). "Duffel Airways" flies every route
   in that environment and was being named to guests in flight details; it is
   no airline anyone can book, so its itineraries never reach the model. */
const isSupplierTestCarrier = (name: string) => /duffel/i.test(name);

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
  const party = flightPassengers(adults, children, input.childrenAges ?? []);

  const legs = [
    { origin, destination, date: input.departureDate },
    ...(input.returnDate
      ? [{ origin: destination, destination: origin, date: input.returnDate }]
      : []),
  ];

  try {
    const itineraries = await duffelConnector.search({
      legs,
      cabin: toCabin(input.cabinClass),
      passengers: party,
    });
    return { ok: true as const, route: `${origin}-${destination}`, itineraries };
  } catch (err) {
    console.error("[ai flightSearch]", err);
    return { ok: false as const, reason: "flight search unavailable" };
  }
}

/** "Sensible" for a preferred airline to lead: no more than one stop beyond the
 * best option, no more than half as long again, and at civilised hours when any
 * option manages that. Past these, loyalty would be costing the guest a day. */
const PREFERRED_EXTRA_STOPS = 1;
const PREFERRED_MAX_DURATION_RATIO = 1.5;

export async function searchFlightOffers(
  input: FlightSearchInput,
  preferredAirlines: PreferredAirline[] = []
) {
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
  const carriersOf = (it: (typeof itineraries)[number]) => [
    ...it.outbound.airlines,
    ...(it.inbound?.airlines ?? []),
  ];
  /** The alliance every carrier on the itinerary belongs to, from our own
   * table (lib/flights/airlineAlliances.ts) — never the model's memory. */
  const allianceOf = (it: (typeof itineraries)[number]) =>
    sharedAlliance(carriersOf(it).map((carrier) => carrier.iataCode));

  const real = itineraries.filter(
    (it) => Number.isFinite(it.priceEur) && !carriersOf(it).some((c) => isSupplierTestCarrier(c.name))
  );
  /* AN ALLIANCE THE VISITOR FLIES (2026-09-24). "We only fly Star Alliance"
     had no effect and the answer named SAS as Star from memory - SAS has been
     SkyTeam since 2024. With `alliance`, only itineraries flown entirely within
     it are kept; when none is, the rest come back with that said. */
  const inAlliance = input.alliance ? real.filter((it) => allianceOf(it) === input.alliance) : real;
  const allianceNote = input.alliance
    ? inAlliance.length
      ? { allianceNote: `Every option here is flown entirely within ${ALLIANCE_NAMES[input.alliance]}.` }
      : {
          allianceNote:
            `Nothing on this route on these dates is flown entirely within ${ALLIANCE_NAMES[input.alliance]}. ` +
            "These are the other options; say so plainly.",
        }
    : {};
  const priced = [...(inAlliance.length ? inAlliance : real)].sort((a, b) => a.priceEur - b.priceEur);

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

  type Itinerary = (typeof priced)[number];
  /* Per direction, not per trip (2026-09-15): one stop out and one back is 2
     against a direct return's 0, so ANA's one-stop return to Tokyo failed "at
     most one stop more" although each way was exactly that. */
  const stopsEachWay = (it: Itinerary) => Math.max(it.outbound.stops, it.inbound?.stops ?? 0);
  const minStopsEachWay = Math.min(...schedules.map(stopsEachWay));
  const minMinutes = Math.min(...schedules.map(totalMinutes));
  const anyCivilised = schedules.some(civilised);
  /** The member's airline this itinerary flies, if any. */
  const preferredOn = (it: Itinerary): string | null => {
    if (!preferredAirlines.length) return null;
    const carriers = [...it.outbound.airlines, ...(it.inbound?.airlines ?? [])];
    for (const preferred of preferredAirlines) {
      const hit = carriers.some(
        (carrier) =>
          (preferred.code && carrier.iataCode === preferred.code) ||
          carrier.name.toLowerCase().includes(preferred.name.toLowerCase())
      );
      if (hit) return preferred.name;
    }
    return null;
  };
  const sensiblePreferred = (it: Itinerary): string | null => {
    const airline = preferredOn(it);
    if (!airline) return null;
    if (stopsEachWay(it) > minStopsEachWay + PREFERRED_EXTRA_STOPS) return null;
    if (totalMinutes(it) > minMinutes * PREFERRED_MAX_DURATION_RATIO) return null;
    if (anyCivilised && !civilised(it)) return null;
    return airline;
  };

  const chosen = [...schedules]
    .sort(
      (a, b) =>
        Number(Boolean(sensiblePreferred(b))) - Number(Boolean(sensiblePreferred(a))) ||
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
      (preferredAirlines.length
        ? "Options on the visitor's preferred airlines come first where the " +
          "connection is sensible (preferredAirline is set on those) - name them " +
          "first. "
        : "") +
      "Most relevant first: civilised hours, then fewest stops, then shortest. " +
      "Times are local. priceRank is 1 for the cheapest schedule; no fares are " +
      "provided - the flight cards display live prices. An option's \"alliance\" is " +
      "set only when every airline on it belongs to that alliance; never name an " +
      "airline's alliance otherwise.",
    ...allianceNote,
    ...(preferredAirlines.length
      ? {
          preferredAirlines: preferredAirlines.map((airline) => airline.name),
          preferredOptionsOnThisRoute: schedules.filter((it) => sensiblePreferred(it)).length,
        }
      : {}),
    options: chosen.map((itinerary) => ({
      ...(sensiblePreferred(itinerary) ? { preferredAirline: sensiblePreferred(itinerary) } : {}),
      ...(allianceOf(itinerary) ? { alliance: ALLIANCE_NAMES[allianceOf(itinerary)!] } : {}),
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
