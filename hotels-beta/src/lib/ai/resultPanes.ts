import type { AiResultSet } from "./types";

/* WHICH PANES AN ANSWER FILLS.
 *
 * Read by `AiResultFrames`, which draws them, and by `LandingResults`, which
 * has to know before it draws anything — it decides how many panes share the
 * row and which of the structured summary's panes stand down. Two components
 * answering this question separately is how they would come to disagree about
 * the column count.
 *
 * Flights are `results.flights` alone, deliberately. `AiResultFrames` runs the
 * legs through `completeLegsForHotels` first, which adds a leg per named
 * hotel's airport — but that function returns its input untouched when there
 * are no legs to begin with, so it can never turn an answer with no flights
 * into one with a flights pane. An answer with flights has the pane either
 * way. */
export function aiPanes(results: AiResultSet): {
  hotels: boolean;
  flights: boolean;
  restaurants: boolean;
} {
  const laterStops = results.laterStops ?? [];
  return {
    hotels: results.hotelIds.length > 0 || laterStops.some((stop) => stop.hotelIds.length > 0),
    flights: results.flights.length > 0,
    restaurants:
      results.restaurantIds.length > 0 ||
      laterStops.some((stop) => stop.restaurantIds.length > 0),
  };
}
