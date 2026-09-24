import { foldForSearch } from "./searchFold";

/* Compared folded (lib/searchFold.ts), so "Saint-Tropez", "St Tropez" and the
   restaurants' own combined city, "Saint-Tropez – Ramatuelle", all match. */
const SAINT_TROPEZ_ALIASES = ["saint tropez", "ramatuelle", "saint tropez ramatuelle"];

/** How the restaurant collection files the whole cluster. */
const SAINT_TROPEZ_RESTAURANT_CITY = "Saint-Tropez – Ramatuelle";

// The shared search fold: case, accents, dashes, "St" for "Saint".
const normalizeCity = foldForSearch;

/* The cluster's every name, so each page finds what it holds under any of them
   (2026-09-24): a concierge answer about Pampelonne made the restaurants'
   "Saint-Tropez – Ramatuelle" the site's destination, and the Hotels page,
   whose rows say "Saint-Tropez" or "Ramatuelle", found none. */
export function expandCityAliases(values: string[]): string[] {
  const normalized = values.map(normalizeCity).filter(Boolean);

  const hasSaintTropezCluster = normalized.some((value) =>
    SAINT_TROPEZ_ALIASES.includes(value)
  );

  if (!hasSaintTropezCluster) {
    return values;
  }

  const out = new Set(values.filter(Boolean));
  out.add("Saint Tropez");
  // How the hotel rows spell it. Exact matches downstream (a Directus `_in`),
  // so the spaced form alone found none of the five Saint-Tropez hotels.
  out.add("Saint-Tropez");
  out.add("Ramatuelle");
  out.add(SAINT_TROPEZ_RESTAURANT_CITY);

  return Array.from(out);
}

/** A city as hotels and airports know it: the restaurants' combined
 * "Saint-Tropez – Ramatuelle" is no hotel's city and no airport's, so the
 * shared search carries "Saint-Tropez", as the hotel rows spell it (the alias
 * brings Ramatuelle). */
export function hotelCityFor(city: string): string {
  return normalizeCity(city) === "saint tropez ramatuelle" ? "Saint-Tropez" : city;
}
