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

/** The exact set the concierge picked, pinned by id. */
export function hotelsHref(query: AiQueryState, results: AiResultSet): string {
  const params = queryStateToParams(query);
  if (results.hotelIds.length) params.set("ids", results.hotelIds.join(","));
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

/* More than one journey hands off as multi-city, which is precisely what that
 * mode on the Flights page is for — an open jaw flattened into a return would
 * send the traveller home from an airport they are not in. */
export function flightsHref(query: AiQueryState, results: AiResultSet): string {
  const params = queryStateToParams(query);
  const legs = results.flights;
  const first = legs[0];
  if (!first) return `/flights?${params.toString()}`;

  params.set("origin", first.origin);
  params.set("cabin", FLIGHTS_PAGE_CABIN[first.cabin] ?? "Economy");

  if (legs.length > 1) {
    params.set("tripType", "multiple");
    // The form takes at most 5, and only searches when every leg is complete —
    // so send whole legs, and no more than it can hold.
    legs.slice(0, 5).forEach((leg, i) => {
      params.set(`leg${i + 1}`, `${leg.origin}-${leg.destination}-${leg.departureDate}`);
    });
    // The single depart/return pair means nothing for a multi-city trip, and
    // leaving the hotel stay in them shows dates that belong to a room.
    params.delete("from");
    params.delete("to");
  } else {
    params.set("tripType", first.returnDate ? "return" : "oneway");
    params.set("from", first.departureDate);
    if (first.returnDate) params.set("to", first.returnDate);
    else params.delete("to");
  }
  return `/flights?${params.toString()}`;
}

/* City only, deliberately.
 *
 * The Restaurants page is city-driven and keeps its own data and design — a
 * concierge pick list is a landing-page frame, not a new filtered mode there.
 * So the handoff opens the right city and lets the page be itself. */
export function restaurantsHref(query: AiQueryState): string {
  const city = query.destination.city.trim();
  return city ? `/restaurants?city=${encodeURIComponent(city)}` : "/restaurants";
}
