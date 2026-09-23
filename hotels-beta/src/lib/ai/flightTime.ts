import "server-only";
import { AIRPORT_COORDS } from "@/lib/airportCoords";
import { estimateFlightHours } from "@/lib/inspire/estimateFlightHours";

/* Estimated nonstop flying time for the concierge (2026-09-23).
 *
 * Asked for "a beach week, no more than 3 hours direct from Copenhagen", the
 * concierge offered Bodrum and Crete "within that flying time". It had no
 * flying time at all - the flight search in development invents schedules, and
 * nothing else it reads holds one - and Heraklion is nearer four hours. It now
 * gets the same estimate the Inspire page shows, measured from the departure
 * airport to the airport each hotel is reached through. */

function coordsOf(iata: string): readonly [number, number] | null {
  return AIRPORT_COORDS[iata.trim().toUpperCase()] ?? null;
}

/** Airport to airport, or null when either is unknown. */
export function flightHoursBetween(fromIata: string, toIata: string): number | null {
  const from = coordsOf(fromIata);
  const to = coordsOf(toIata);
  if (!from || !to) return null;
  return estimateFlightHours(from[0], from[1], to[0], to[1]);
}

/** The shortest estimate from any of the departure airports to `toIata`,
 * falling back to the hotel's own coordinates when its airport is unknown. */
export function shortestFlightHours(
  fromIatas: string[],
  toIata: string,
  fallback?: { lat?: number | null; lng?: number | null }
): number | null {
  const destination =
    coordsOf(toIata) ??
    (Number.isFinite(fallback?.lat) && Number.isFinite(fallback?.lng)
      ? ([fallback!.lat as number, fallback!.lng as number] as const)
      : null);
  if (!destination) return null;
  let best: number | null = null;
  for (const iata of fromIatas) {
    const from = coordsOf(iata);
    if (!from) continue;
    const hours = estimateFlightHours(from[0], from[1], destination[0], destination[1]);
    if (best === null || hours < best) best = hours;
  }
  return best;
}

/** Departure airports the tools know, upper-cased and deduplicated. */
export function knownAirports(codes: string[] | undefined): string[] {
  return [...new Set((codes ?? []).map((c) => c.trim().toUpperCase()))].filter((c) => coordsOf(c));
}

export const FLIGHT_TIME_BASIS =
  "Estimated nonstop flying time from the distance, gate to gate, not a timetable: " +
  "say \"about\" with it, never say a nonstop exists because of it, and never give a " +
  "flying time you were not given here.";
