import { CITY_AIRPORTS } from "@/lib/cityAirports";

/* The hotel city an airport clearly belongs to, or "" (2026-09-23).
 *
 * getCityForAirportIata always answers - it is for labels, where some name is
 * better than a code. Written into the shared search as the destination, that
 * put a Mauritius village ("Beau Champ", the nearest of five towns Ramgoolam
 * serves) on every page after a flight to MRU, and Clear could not tell it was
 * the conversation's. Here an airport belongs to a city only when its own name
 * carries the city (Paris Orly, London Heathrow, Nice Cote d'Azur), or when it
 * serves that one hotel city and no other (CDG, Catania for Taormina, JFK).
 * An island's airport serving several resorts belongs to none of them. */
const OWNER: Record<string, string> = (() => {
  const byIata = new Map<string, { city: string; distKm: number; named: boolean }[]>();
  for (const [city, airports] of Object.entries(CITY_AIRPORTS)) {
    for (const airport of airports) {
      const list = byIata.get(airport.iata) ?? [];
      list.push({
        city,
        distKm: airport.distKm,
        named: airport.label.toLowerCase().includes(city.toLowerCase()),
      });
      byIata.set(airport.iata, list);
    }
  }
  const owner: Record<string, string> = {};
  for (const [iata, cities] of byIata) {
    const named = cities.filter((c) => c.named).sort((a, b) => a.distKm - b.distKm);
    if (named.length) owner[iata] = named[0].city;
    else if (cities.length === 1) owner[iata] = cities[0].city;
  }
  return owner;
})();

export function cityOwningAirport(iata: string): string {
  return OWNER[iata.trim().toUpperCase()] ?? "";
}
