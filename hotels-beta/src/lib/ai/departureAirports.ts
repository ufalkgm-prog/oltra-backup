import "server-only";
import { AIRPORT_OPTIONS } from "@/lib/airportOptions";
import { getAirportsForCity } from "@/lib/cityAirports";

/* Every airport a guest could reasonably leave a named city from (Ulrik,
 * 2026-09-15).
 *
 * "We'd fly business from London" was searched from Heathrow alone, and nothing
 * in the answer said Gatwick or City existed. A departure city now expands to
 * its real airports, which are searched side by side and all named.
 *
 * Two sources, in order. cityAirports.ts covers every OLTRA hotel city and
 * already knows distance and size, so London gives Heathrow, Gatwick, Luton,
 * Stansted and City; small strips, outlying medium airports and anything past
 * an hour's drive are left out. A departure city we hold no hotel in falls back to the airport
 * list the Flights page offers, matched on the airport's own municipality —
 * large before medium, which is that list's own order. */

/** Past this, an airport serves the region rather than the city. */
const MAX_DEPARTURE_KM = 60;
/** A medium airport counts only when it is the city's own, like London City;
 * further out it is Southend or Roskilde, which no one means by "from London"
 * or "from Copenhagen". */
const MAX_MEDIUM_DEPARTURE_KM = 25;
/** More than this is a survey of a region, and each one is a live search. */
export const MAX_DEPARTURE_AIRPORTS = 6;

export type DepartureAirport = { iata: string; label: string };

function simplify(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

export function departureAirportsForCity(city: string): DepartureAirport[] {
  const name = city.trim();
  if (!name) return [];

  const fromHotelCities = getAirportsForCity(name)
    .filter((airport) =>
      airport.size === "large"
        ? airport.distKm <= MAX_DEPARTURE_KM
        : airport.size === "medium" && airport.distKm <= MAX_MEDIUM_DEPARTURE_KM
    )
    .sort((a, b) => (a.size === b.size ? a.distKm - b.distKm : a.size === "large" ? -1 : 1))
    .map((airport) => ({ iata: airport.iata, label: airport.label }));
  if (fromHotelCities.length) return fromHotelCities.slice(0, MAX_DEPARTURE_AIRPORTS);

  const wanted = simplify(name);
  return AIRPORT_OPTIONS.filter((option) => simplify(option.city) === wanted)
    .map((option) => ({
      iata: option.value,
      // "LHR · London Heathrow, GB" → "London Heathrow"
      label: option.label.replace(/^[A-Z]{3} · /, "").replace(/, [A-Z]{2}$/, ""),
    }))
    .slice(0, MAX_DEPARTURE_AIRPORTS);
}
