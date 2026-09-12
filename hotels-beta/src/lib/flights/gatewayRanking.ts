/* WHICH AIRPORT, JUDGED ON THE WHOLE JOURNEY.
 *
 * WHY THIS EXISTS. Every airport choice in this codebase was made without
 * knowing where the guest starts from. `cityAirports.ts` lists airports
 * best-first by a rule about the place; `pickPrimaryAirportForCity` picks the
 * biggest, or the first of a hand-ordered list. Neither can see that from
 * Copenhagen you fly nonstop to Geneva and change planes for Chambery.
 *
 * That gap has a shape, and it is the reason for this file: Courchevel 1850 is
 * 2h44 by road from Geneva and 1h40 from Chambery, so anything reading the
 * transfer alone prefers Chambery and hands the guest a connection. An hour
 * saved on the ground costs two in the air. The only defensible comparison is
 * flight plus transfer, added up, from THIS origin — with a change of planes
 * having to earn its place, because a direct flight is worth more than its clock
 * time: a stop must cut a quarter off the whole journey, or two fifths of it
 * when the flight is a short one (STOP_MUST_SAVE_SHARE).
 *
 * THE ARITHMETIC IS DONE HERE, NOT IN THE PROMPT. The concierge is handed a
 * list already ranked, with a total per candidate, for the same reason it is
 * handed price ranks instead of prices: a rule the model has to apply itself is
 * a rule it can skip, and CLAUDE-AI.md's record on that is unambiguous.
 *
 * WHAT IT REFUSES TO DO. It never invents a transfer duration. A destination
 * whose last leg is a light aircraft, a boat or a seaplane has no road time
 * worth adding — the drive to Namiri Plains measures ten hours and nobody makes
 * it — so those rank on flight time alone and say the transfer is still to be
 * confirmed. `transferRoutes.ts` holds what actually happens, in prose, and
 * that stays the answer a guest is given.
 */

import {
  getAirportsForCity,
  hasCuratedGatewayOrder,
  type CityAirport,
} from "@/lib/cityAirports";
import { getTransferRoute } from "@/lib/transferRoutes";
import {
  getTransferTime,
  hasNoRoadRoute,
  unroutableReason,
} from "@/lib/transferTimes";

/** What a flight search found for one candidate airport. Deliberately carries
 * no fare: this module ranks journeys by time, and the no-prices guarantee
 * (§50) is structural — a figure absent from the input cannot leak. */
export type GatewayFlightFacts = {
  /** Anything at all on these dates. */
  flies: boolean;
  /** Elapsed minutes of the quickest outbound itinerary of ANY kind, layovers
   * included. Null when nothing flies or the search failed. */
  fastestMinutes: number | null;
  /** Elapsed minutes of the quickest NONSTOP outbound, or null if there is no
   * nonstop on these dates.
   *
   * Held separately because the two are not interchangeable and conflating them
   * was a real defect: an airport with a nonstop was being ranked on the
   * duration of a connecting itinerary that happened to be quicker, so it was
   * labelled direct and timed as a connection. If we would send the guest on
   * the nonstop, the nonstop's duration is the one that belongs in the total. */
  fastestNonstopMinutes: number | null;
  /** Fewest stops on any itinerary found — 0 means a nonstop exists. */
  minStops: number | null;
};

export type TransferBasis =
  /** Measured driving time, and the last leg really is a drive. */
  | "road"
  /** The destination's own route ends in a light aircraft, boat, ferry,
   * seaplane, helicopter or domestic flight. A road time, if we even have one,
   * is not what the guest does. */
  | "onward-leg"
  /** Measured, and there is no road: an island, or car-free Zermatt. */
  | "no-road-route"
  /** A road exists and the routing API cannot return it (South Korea, a border
   * crossing, an unmapped reserve track). */
  | "unroutable"
  /** Measured, but the figure cannot be true of any vehicle — a ferry-inclusive
   * result with a long wait folded into it. */
  | "implausible"
  /** Nobody has measured this pair yet. */
  | "unmeasured";

export type RankedGateway = {
  iata: string;
  label: string;
  /** Straight-line km, as `cityAirports.ts` holds it. Never a drive time. */
  distKm: number;
  flies: boolean;
  nonstop: boolean;
  /** Quickest itinerary of any kind. Informational — not what the total is
   * built from when a nonstop exists. */
  fastestFlightMinutes: number | null;
  /** The flight we would actually put the guest on: the nonstop if there is
   * one, otherwise the quickest connection. This is the half of `totalMinutes`
   * that is in the air. */
  flightMinutes: number | null;
  minStops: number | null;
  transferMinutes: number | null;
  transferBasis: TransferBasis;
  /** `flightMinutes` plus transfer. Null unless both are known. */
  totalMinutes: number | null;
  /** What the ordering actually sorts on: `totalMinutes`, raised by
   * the saving a stop had to deliver when this airport can only be reached with
   * a change of planes. Exposed rather than hidden inside the comparator so the order can
   * be explained and tested. Never show it to a guest — it is a scoring
   * figure, not a journey time. */
  effectiveMinutes: number | null;
  /** True for the airport `transferRoutes.ts` writes its route from — we know
   * how a guest gets to the door from here and, for the others, we do not. */
  routeArrival: boolean;
  rank: number;
  recommended: boolean;
};

export type GatewayComparison = {
  destination: string;
  ranked: RankedGateway[];
  best: RankedGateway | null;
  /** True only when every candidate that flies had both a flight time and a
   * usable transfer time, so the totals are like-for-like. When false the
   * ranking is on air time and the transfer is still to be confirmed. */
  comparable: boolean;
  /** One plain sentence for the concierge to reason from — no trade words in
   * it, per §50's "never say aloud the words we use to explain the data". */
  basis: string;
  /** The saving a stop had to beat here — 0.4 on a short flight, 0.25
   * otherwise. Reported so the order can be explained rather than just
   * asserted. */
  stopMustSave: number;
  /** True when the best direct flight to this destination is under four hours,
   * which is what selected the stricter figure above. */
  shortHaulFlights: boolean;
};

/* HOW MUCH A STOP HAS TO SAVE BEFORE IT IS WORTH TAKING, and there are two
 * answers because the question is not the same on a two-hour flight as on a
 * twelve-hour one.
 *
 * A connection is worse than its minutes say, and by more than a little: it can
 * be missed, it strands you when it is, bags go astray at the transfer, and none
 * of that is in a duration. For this clientele a direct flight is close to a
 * requirement rather than a preference.
 *
 * SHORT FLIGHTS ARE BARELY WORTH BREAKING UP AT ALL. Ulrik's words, and they set
 * the second tier: "I would much rather drive another hour than risk a stop."
 * On a short hop the stop is most of the misery of the journey and the saving is
 * small in absolute terms whatever it looks like as a percentage - so under four
 * hours in the air a stop has to cut TWO FIFTHS off the whole journey before it
 * is offered. Above that, a quarter.
 *
 * Stated as the SAVING REQUIRED, not as a penalty, because that is the thing
 * with a meaning: "a stop must cut a quarter off the door-to-door time". The
 * multiplier the comparator needs is derived from it - requiring a saving of s
 * means scoring the connection at 1/(1-s) of its length, so 0.25 becomes 1.33x
 * and 0.4 becomes 1.67x.
 *
 * Three earlier versions, each wrong somewhere: 45 minutes let a stop win by
 * saving three quarters of an hour; a flat three hours could never be cleared on
 * a short trip however much of it was saved; a flat fifth ignored that short and
 * long journeys are different problems. */
export const STOP_MUST_SAVE_SHARE = 0.25;
export const SHORT_HAUL_STOP_MUST_SAVE_SHARE = 0.4;

/** What counts as a short flight, measured on the best DIRECT flight available
 * to the destination - "flights under four hours", not "journeys". */
export const SHORT_HAUL_FLIGHT_MINUTES = 240;

/** The connecting journey as the ordering sees it. One function, so the
 * comparator, the exposed `effectiveMinutes` and anything explaining the order
 * cannot round differently. */
export function withStopPenalty(
  minutes: number,
  nonstop: boolean,
  mustSave: number
): number {
  return nonstop ? minutes : Math.round(minutes / (1 - mustSave));
}

/* A HAND-ORDERED FIRST CHOICE KEEPS ITS PLACE unless the difference is
 * material, and this is the constant that decides "material".
 *
 * It exists because of a measured near-miss. From Copenhagen, both Geneva and
 * Lyon are nonstop, and the drives are 2h49 and 2h23 - so totalling them puts
 * LYON ahead for Courchevel by nineteen minutes. Geneva is first in that list
 * because somebody worked out that is where everyone actually flies, and
 * CLAUDE-AI.md records that answering Lyon there is worse. Nineteen minutes,
 * measured to a hotel centroid on a no-traffic road estimate, is not grounds
 * for a new heuristic to overturn a recorded human decision.
 *
 * It applies ONLY to the 59 hand-ordered destinations. Everywhere else position
 * one is the nearest strip and makes no claim worth protecting. And it never
 * demotes a direct flight in favour of a connection, whatever the margin - see
 * the promotion itself. */
export const CURATED_GRACE_MINUTES = 45;

/* Below this implied average speed a measured "drive" is not a drive: it is a
 * short hop with a long wait for a ferry folded into it. Spanish Town from
 * Tortola measures 13km in 91 minutes — 9km/h, which no vehicle averages.
 * Screened out rather than deleted, because the measurement is real and the
 * interpretation is ours. */
const MIN_PLAUSIBLE_KMH = 15;
const SCREEN_ABOVE_KM = 5;

const NON_ROAD_MODES = new Set([
  "light aircraft",
  "domestic flight",
  "seaplane",
  "boat",
  "ferry",
  "helicopter",
]);

/** How long the last leg takes from this airport, and on what grounds. Exported
 * because the classic pages and the concierge must answer this identically —
 * two implementations of it is how the two halves of the site came to disagree
 * about Val d'Isere in the first place. */
export function resolveTransfer(
  destination: string,
  iata: string
): { minutes: number | null; basis: TransferBasis } {
  const route = getTransferRoute(destination);
  if (route && route.legs.some((leg) => NON_ROAD_MODES.has(leg.mode))) {
    return { minutes: null, basis: "onward-leg" };
  }
  if (hasNoRoadRoute(destination, iata)) {
    return { minutes: null, basis: "no-road-route" };
  }
  if (unroutableReason(destination, iata)) {
    return { minutes: null, basis: "unroutable" };
  }
  const measured = getTransferTime(destination, iata);
  if (!measured) return { minutes: null, basis: "unmeasured" };
  const kmh = measured.km / Math.max(1 / 60, measured.minutes / 60);
  if (measured.km > SCREEN_ABOVE_KM && kmh < MIN_PLAUSIBLE_KMH) {
    return { minutes: null, basis: "implausible" };
  }
  return { minutes: measured.minutes, basis: "road" };
}

function basisSentence(
  ranked: RankedGateway[],
  comparable: boolean,
  shortHaul: boolean
): string {
  if (!ranked.length) return "We have no airport for this destination.";
  if (comparable) {
    const best = ranked.find((g) => g.recommended);
    const stopWins = best && !best.nonstop && ranked.some((g) => g.nonstop && g.flies);
    if (stopWins) {
      return "Ranked on the whole journey - the flight and the transfer added together. This one wins DESPITE needing a change of planes, because it cuts a large share off the best direct routing. Say plainly that it involves a stop, and what it saves, rather than presenting it as direct.";
    }
    return shortHaul
      ? "Ranked on the whole journey - the flight and the transfer added together. This is a short flight, and a stop is barely worth it at any saving: it would have had to cut two fifths off the door-to-door time. Offer the direct one, and do not raise a change of planes to save time on the road."
      : "Ranked on the whole journey - the flight and the transfer added together, from this departure point. A direct routing is preferred unless a stop would cut a quarter off the journey, so the one on top is the one to give.";
  }
  const flying = ranked.filter((g) => g.flies);
  if (!flying.length) return "Nothing flies to any of these airports on those dates.";
  if (flying.every((g) => g.transferBasis === "onward-leg")) {
    return "Ranked on flying time. The last stretch is not a drive, so it has no comparable duration - the route for it is held separately and should be given as it stands.";
  }
  return "Ranked on flying time, because the transfer from at least one of these is not something we have measured. Say the transfer will be confirmed rather than estimating it.";
}

/** Rank the airports serving `destination` by total travel time from wherever
 * the flight facts were gathered.
 *
 * `facts` is keyed by IATA. A candidate missing from it is treated as unknown
 * rather than dropped, so a failed search degrades the ranking instead of
 * silently removing an airport from the answer. */
export function rankGateways(
  destination: string,
  facts: Record<string, GatewayFlightFacts>,
  airports?: CityAirport[]
): GatewayComparison {
  const list = airports ?? getAirportsForCity(destination);
  const route = getTransferRoute(destination);

  /* WHICH TIER APPLIES, decided ONCE for the whole comparison rather than per
   * candidate. It has to be: "is this a short flight" is a fact about the
   * destination from here, not about one airport, and a per-candidate test
   * would score a 5h connection by the lenient rule while scoring the 2h
   * direct it is competing with by the strict one.
   *
   * Measured on the best DIRECT flight, because that is the journey a stop is
   * being compared against. With no direct anywhere in the list every candidate
   * is penalised alike and the tier changes no ordering, so the fastest flight
   * of any kind stands in. */
  const factsList = list.map((a) => facts[a.iata]).filter(Boolean);
  const directMinutes = factsList
    .map((f) => f.fastestNonstopMinutes)
    .filter((m): m is number => m !== null);
  const anyMinutes = factsList
    .map((f) => f.fastestMinutes)
    .filter((m): m is number => m !== null);
  const reference = directMinutes.length
    ? Math.min(...directMinutes)
    : anyMinutes.length
    ? Math.min(...anyMinutes)
    : null;
  const shortHaulFlights = reference !== null && reference < SHORT_HAUL_FLIGHT_MINUTES;
  const stopMustSave = shortHaulFlights
    ? SHORT_HAUL_STOP_MUST_SAVE_SHARE
    : STOP_MUST_SAVE_SHARE;

  const candidates = list.map((airport, position) => {
    const fact = facts[airport.iata];
    const transfer = resolveTransfer(destination, airport.iata);
    const fastest = fact?.fastestMinutes ?? null;
    const nonstopMinutes = fact?.fastestNonstopMinutes ?? null;
    const nonstop = nonstopMinutes !== null;
    /* The flight we would actually book: the nonstop where there is one, even
     * when some connection is quicker on paper. */
    const flightMinutes = nonstopMinutes ?? fastest;
    const total =
      flightMinutes !== null && transfer.minutes !== null
        ? flightMinutes + transfer.minutes
        : null;
    return {
      position,
      gateway: {
        iata: airport.iata,
        label: airport.label,
        distKm: airport.distKm,
        flies: fact?.flies ?? false,
        nonstop,
        fastestFlightMinutes: fastest,
        flightMinutes,
        minStops: fact?.minStops ?? null,
        transferMinutes: transfer.minutes,
        transferBasis: transfer.basis,
        totalMinutes: total,
        effectiveMinutes:
          total === null ? null : withStopPenalty(total, nonstop, stopMustSave),
        routeArrival: route?.arriveAt === airport.iata,
        rank: 0,
        recommended: false,
      } satisfies RankedGateway,
    };
  });

  const flying = candidates.filter((c) => c.gateway.flies);
  const comparable =
    flying.length > 0 && flying.every((c) => c.gateway.totalMinutes !== null);

  /* THE STOP PENALTY LIVES IN THE COMPARATOR, which is the point of expressing
   * it as minutes rather than as a rule. Adding a constant to one side is a
   * transitive ordering, so the sort is well-defined; the promotion pass it
   * replaced was not, and a non-transitive comparator returns a different
   * answer depending on which pairs the sort happens to compare. */
  /* ONE SCORE, used by the comparator AND by the curated promotion below.
   * They must read the same figure: when they did not, curation compared raw
   * totals against an ordering built on penalised ones and put a change of
   * planes back on top. */
  const score = (g: RankedGateway) => {
    if (comparable) return g.effectiveMinutes ?? Infinity;
    if (g.flightMinutes === null) return Infinity;
    return withStopPenalty(g.flightMinutes, g.nonstop, stopMustSave);
  };

  const sorted = [...candidates].sort((a, b) => {
    // Somewhere you cannot get to on those dates is last, whatever else is true
    // of it.
    if (a.gateway.flies !== b.gateway.flies) return a.gateway.flies ? -1 : 1;

    /* Door to door where we have both halves; air time alone where we do not,
     * with the same preference for a direct applied to it. */
    const byJourney = score(a.gateway) - score(b.gateway);
    if (byJourney !== 0) return byJourney;

    if (!comparable && a.gateway.routeArrival !== b.gateway.routeArrival) {
      // Prefer the airport whose route to the door we actually hold. Knowing
      // how the last stretch works beats a guess about which field is nearer.
      return a.gateway.routeArrival ? -1 : 1;
    }
    // The list order is itself a judgement for the 59 hand-ordered
    // destinations, so it breaks ties ahead of raw distance.
    return a.position - b.position;
  });

  /* ONE PROMOTION LEFT, with a hard limit on it: CURATION MAY NOT PUT A CHANGE
   * OF PLANES AHEAD OF A DIRECT FLIGHT.
   *
   * That limit is stated rather than left to the arithmetic, and the history is
   * why. The first version compared raw totals and answered
   * Nice-with-a-connection over a nonstop to Toulon 25 minutes behind it. I
   * fixed that by comparing PENALISED minutes, which worked only while the
   * penalty was a flat three hours; the moment it became proportional, Nice
   * came back - a fifth of a five-and-a-half-hour journey is 67 minutes, so it
   * sat 42 minutes behind Toulon, inside the 45-minute grace. Twice the same
   * defect, from two different numbers, is a sign the rule was missing rather
   * than mistuned.
   *
   * So the two claims are separated. Curation records WHICH AIRPORT GUESTS USE
   * for a place and can settle a close call between comparable journeys. It
   * cannot answer whether this guest has to change planes - that is not a fact
   * about the destination at all - so where the leader is direct and the
   * curated choice is not, the direct stands.
   *
   * It stays a promotion rather than joining the comparator because it is not
   * transitive: it moves one candidate past another it is slower than.
   *
   * AND IT IS NOT GATED ON `comparable`, which is where it was wrong. Gating it
   * there looked reasonable - no totals, nothing to be close on - but the
   * destinations with no road time are the reserves and the islands, which are
   * exactly the ones whose gateway was chosen by hand. The verifier caught the
   * consequence: the Serengeti answered MWZ, because Mwanza came back 18
   * minutes quicker in the air than Kilimanjaro, and §51 put Kilimanjaro first
   * deliberately - it is the northern circuit's international gateway, while
   * Mwanza is regional. Eighteen minutes of air time is not a reason to unpick
   * that. Where there are no totals the grace is applied to flying time
   * instead, through the same `score`. */
  let ordered = sorted;
  if (hasCuratedGatewayOrder(destination)) {
    const leader = sorted[0];
    const curated = sorted.find((c) => c.position === 0);
    const wouldDemoteADirect =
      Boolean(leader?.gateway.nonstop) && !curated?.gateway.nonstop;
    if (
      curated &&
      leader &&
      curated !== leader &&
      !wouldDemoteADirect &&
      curated.gateway.flies &&
      Number.isFinite(score(curated.gateway)) &&
      Number.isFinite(score(leader.gateway)) &&
      score(curated.gateway) - score(leader.gateway) <= CURATED_GRACE_MINUTES
    ) {
      ordered = [curated, ...ordered.filter((c) => c !== curated)];
    }
  }

  const ranked = ordered.map((c, i) => ({
    ...c.gateway,
    rank: i + 1,
    recommended: i === 0 && c.gateway.flies,
  }));

  return {
    destination,
    ranked,
    best: ranked.find((g) => g.recommended) ?? null,
    comparable,
    basis: basisSentence(ranked, comparable, shortHaulFlights),
    stopMustSave,
    shortHaulFlights,
  };
}

/** Facts for one airport from a set of already-normalised itineraries — the
 * shape the classic pages hold client-side, so they rank from what they have
 * already fetched rather than searching again. */
export function factsFromDurations(
  durations: Array<{ minutes: number; stops: number }>
): GatewayFlightFacts {
  if (!durations.length) {
    return { flies: false, fastestMinutes: null, fastestNonstopMinutes: null, minStops: null };
  }
  const nonstops = durations.filter((d) => d.stops === 0).map((d) => d.minutes);
  return {
    flies: true,
    fastestMinutes: Math.min(...durations.map((d) => d.minutes)),
    fastestNonstopMinutes: nonstops.length ? Math.min(...nonstops) : null,
    minStops: Math.min(...durations.map((d) => d.stops)),
  };
}

/** "4h 50m", for a label. Kept here so the ranking and whatever displays it
 * round the same way. */
export function formatJourneyMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
