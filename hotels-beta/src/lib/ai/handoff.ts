import { queryStateToParams } from "./aiSearchStore";
import type { AiQueryState, AiResultSet } from "./types";

/* Where a result set goes when the visitor wants it on a real page.
 *
 * Extracted from the landing frames so the concierge modal can offer the same
 * handoff from any page — item 6's "answer, then offer to show it where it
 * belongs". One implementation, so the link in the modal and the button on the
 * card frame can never disagree about what they hand over.
 *
 * Every page here is URL-driven (CLAUDE.md §8), which is exactly why the
 * handoff is a URL rather than a store read: the destination page reconstructs
 * its own state from params, the same way it would after a manual search. */

/** The concierge speaks Duffel's cabin values; the Flights page's `cabin`
 * param takes its own display labels. */
const FLIGHTS_PAGE_CABIN: Record<string, string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First",
};

/** The exact set the concierge picked, pinned by id — and ONLY that, plus the
 * stay (Ulrik, 2026-09-14).
 *
 * This used to carry the answer's geography and its setting/activity tags too,
 * so the Hotels page arrived with "Country: Spain · Setting: Beachfront ·
 * Setting: Coastal" in its destination box: tags approximating an answer that
 * was really a hand-picked list, and editing them edited a search nobody ran.
 * The page now shows a single "AI curated results" token for `?ids=`. The
 * geography still reaches the rest of the site through the shared session and
 * the "See all hotels in X" link (allHotelsHref), which is where a search by
 * place belongs. */
export function hotelsHref(query: AiQueryState, results: AiResultSet): string {
  if (!results.hotelIds.length) return allHotelsHref(query);
  const params = queryStateToParams(query);
  for (const key of ["city", "state", "admin_region", "country", "settings", "activities"]) {
    params.delete(key);
  }
  params.set("ids", results.hotelIds.join(","));
  params.set("search_submitted", "1");
  return `/hotels?${params.toString()}`;
}

/** Everything we hold in the destination, rather than the concierge's pick —
 * the "see all hotels in X" escape. */
export function allHotelsHref(query: AiQueryState): string {
  const params = queryStateToParams(query);
  params.set("search_submitted", "1");
  return `/hotels?${params.toString()}`;
}

/** More than one leg that is a CHOICE between routes rather than one journey:
 * any leg with its own return, or every leg leaving the same place on the same
 * day. A real multi-city trip is a chain of one-way legs. Read by the handoff
 * below and by the panel's footnote, so the two cannot disagree. */
export function flightLegsAreAlternatives(
  legs: { origin: string; departureDate: string; returnDate?: string }[]
): boolean {
  if (legs.length < 2) return false;
  const [first] = legs;
  return (
    legs.some((leg) => Boolean(leg.returnDate)) ||
    legs.every((leg) => leg.origin === first.origin && leg.departureDate === first.departureDate)
  );
}

/* A chain of one-way journeys hands off as multi-city, which is precisely what
 * that mode on the Flights page is for — an open jaw flattened into a return
 * would send the traveller home from an airport they are not in. Alternative
 * routes hand off as the first of them. */
export function flightsHref(query: AiQueryState, results: AiResultSet): string {
  /* The journey, the dates and the guests — nothing else (Ulrik, 2026-09-14).
     This used to start from queryStateToParams, so the Flights page URL
     arrived carrying the answer's hotel city, admin region, settings and
     activities: filters the Flights page has no use for, approximating an
     answer that was really a chosen set. The destination now travels as the
     exact airport searched, not as a city for the page to resolve. */
  const params = new URLSearchParams();
  if (query.adults > 0) params.set("adults", String(query.adults));
  if (query.kids > 0) params.set("kids", String(query.kids));
  query.childrenAges.forEach((age, index) => {
    if (index < 6) params.set(`kid_age_${index + 1}`, String(age));
  });

  const legs = results.flights;
  const first = legs[0];
  if (!first) {
    if (query.origin.trim()) params.set("origin", query.origin.trim());
    return `/flights?${params.toString()}`;
  }

  params.set("origin", first.origin);
  params.set("cabin", FLIGHTS_PAGE_CABIN[first.cabin] ?? "Economy");
  // "Star Alliance only" pre-selects that alliance's airlines (2026-09-24).
  if (first.alliance) params.set("alliance", first.alliance);

  /* ALTERNATIVES ARE NOT A MULTI-CITY TRIP (2026-09-23). "Copenhagen to
     London, back on the 15th" came back as five return trips, one per London
     airport, and all five were sent as legs of one multi-city itinerary —
     five parallel departures on the same morning, which the page could not
     make sense of and showed as an empty form. A real multi-city trip is a
     chain of one-way legs; a set where any leg has its own return, or where
     every leg leaves from the same place on the same day, is a choice between
     routes, and the page gets the first of them. */
  if (legs.length > 1 && !flightLegsAreAlternatives(legs)) {
    params.set("tripType", "multiple");
    // The form takes at most 5, and only searches when every leg is complete —
    // so send whole legs, and no more than it can hold.
    legs.slice(0, 5).forEach((leg, i) => {
      params.set(`leg${i + 1}`, `${leg.origin}-${leg.destination}-${leg.departureDate}`);
    });
    // No from/to here: a single depart/return pair means nothing for a
    // multi-city trip, and the hotel stay's dates belong to a room.
  } else {
    params.set("tripType", first.returnDate ? "return" : "oneway");
    params.set("destination", first.destination);
    params.set("from", first.departureDate);
    if (first.returnDate) params.set("to", first.returnDate);
    else params.delete("to");
    // "Not before 9" sets the page's departure-time filters (2026-09-24).
    if (first.departAfter !== undefined) params.set("depart_after", String(first.departAfter));
    if (first.returnDate && first.returnAfter !== undefined) {
      params.set("return_after", String(first.returnAfter));
    }
  }
  return `/flights?${params.toString()}`;
}

/* A CITY THE CONVERSATION IS ABOUT, ON A PAGE ITS ANSWER HAD NOTHING FOR
 * (Ulrik, 2026-09-23). "If a question mentions a specific city, that city
 * should be set as the destination on all underlying pages." An answer about
 * dinner in Paris left the Hotels and Flights pages behind the panel where
 * they were. These carry the city and the stay only: no ids (the answer chose
 * no hotels), no tags (§ "AI curated results"), no invented airport - the
 * Flights page resolves a city to its main airport itself. Empty when the
 * answer has no city. */
export function cityHotelsHref(query: AiQueryState): string {
  const city = query.destination.city.trim();
  if (!city) return "";
  const params = queryStateToParams(query);
  for (const key of ["state", "admin_region", "country", "settings", "activities", "origin"]) {
    params.delete(key);
  }
  params.set("search_submitted", "1");
  return `/hotels?${params.toString()}`;
}

export function cityFlightsHref(query: AiQueryState): string {
  const city = query.destination.city.trim();
  if (!city) return "";
  const params = new URLSearchParams();
  params.set("city", city);
  if (query.origin.trim()) params.set("origin", query.origin.trim());
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.adults > 0) params.set("adults", String(query.adults));
  if (query.kids > 0) params.set("kids", String(query.kids));
  query.childrenAges.forEach((age, index) => {
    if (index < 6) params.set(`kid_age_${index + 1}`, String(age));
  });
  return `/flights?${params.toString()}`;
}

/* City only, deliberately.
 *
 * The Restaurants page is city-driven and keeps its own data and design — a
 * concierge pick list is a landing-page frame, not a new filtered mode there.
 * So the handoff opens the right city and lets the page be itself. */
export function restaurantsHref(query: AiQueryState, nearHotelId?: number): string {
  const city = query.destination.city.trim();
  if (!city) return "/restaurants";
  const params = new URLSearchParams({ city });
  // The hotel the answer's walking times were measured from, marked on the map.
  if (nearHotelId) params.set("hotel_id", String(nearHotelId));
  return `/restaurants?${params.toString()}`;
}
