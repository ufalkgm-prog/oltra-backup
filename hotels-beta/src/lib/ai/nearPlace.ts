import "server-only";
import { haversineKm } from "@/lib/geoDistance";

/* "Within walking distance of the Pantheon" (2026-09-15).
 *
 * Asked for a hotel near the Pantheon, the concierge chose from general
 * knowledge — it was given no coordinates — and named Hotel de Russie, about a
 * twenty-minute walk, as "an easy walk". Every published hotel and restaurant
 * already has coordinates; the only unknown is the place the visitor names. So
 * that one place is looked up with Google's place search (the same Find Place
 * call the restaurant geocoding scripts use, which found "MoMA, New York" where
 * the plain address geocoder returned the middle of Manhattan), and every
 * candidate gets a distance and a walking estimate the model can quote.
 *
 * Walking time is straight-line distance with an allowance for streets, not a
 * routed walk: plenty to tell eight minutes from twenty, and free. */

export type NearPlace = { searchedFor: string; name: string; address: string; lat: number; lng: number };

export type NearLookup =
  | { status: "found"; place: NearPlace }
  | { status: "not-found"; searchedFor: string }
  | { status: "unavailable"; searchedFor: string };

/** Streets are not straight lines; 1.3 is the usual allowance for a city grid. */
const WALK_DETOUR = 1.3;
const WALK_KMH = 5;
/** Past this a walking time is not an answer anyone wants. */
const MAX_WALK_KM = 5;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; result: NearLookup }>();

export async function findNearPlace(query: string): Promise<NearLookup> {
  const searchedFor = query.trim();
  const key = searchedFor.toLowerCase();
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!searchedFor || !apiKey) return { status: "unavailable", searchedFor };

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const params = new URLSearchParams({
    input: searchedFor,
    inputtype: "textquery",
    fields: "geometry,name,formatted_address",
    key: apiKey,
  });

  let result: NearLookup;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`,
      { signal: AbortSignal.timeout(5000), cache: "no-store" }
    );
    const data = (await res.json()) as {
      status?: string;
      candidates?: { name?: string; formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }[];
    };
    const first = data.candidates?.[0];
    const lat = first?.geometry?.location?.lat;
    const lng = first?.geometry?.location?.lng;

    if (res.ok && data.status === "OK" && typeof lat === "number" && typeof lng === "number") {
      result = {
        status: "found",
        place: { searchedFor, name: first?.name ?? searchedFor, address: first?.formatted_address ?? "", lat, lng },
      };
    } else if (res.ok && data.status === "ZERO_RESULTS") {
      result = { status: "not-found", searchedFor };
    } else {
      // A quota, key or outage problem is not "that place does not exist", and
      // is not cached, so the next question tries again.
      return { status: "unavailable", searchedFor };
    }
  } catch {
    return { status: "unavailable", searchedFor };
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), result });
  return result;
}

/** Distance from the place, and a walking estimate while walking is sensible. */
export function distanceFromPlace(
  place: NearPlace,
  lat: number | string | null | undefined,
  lng: number | string | null | undefined
): { distanceKm: number; walkMinutes: number | null } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
  const km = haversineKm(place.lat, place.lng, la, ln);
  return {
    distanceKm: Math.round(km * 10) / 10,
    walkMinutes: km <= MAX_WALK_KM ? Math.max(1, Math.round(((km * WALK_DETOUR) / WALK_KMH) * 60)) : null,
  };
}

/** Nearest first; anything without coordinates goes last, in its old order. */
export function sortByDistance<T>(
  items: T[],
  place: NearPlace,
  coords: (item: T) => { lat: unknown; lng: unknown }
): T[] {
  const km = new Map<T, number>();
  for (const item of items) {
    const { lat, lng } = coords(item);
    const d = distanceFromPlace(place, lat as number, lng as number);
    km.set(item, d ? d.distanceKm : Number.POSITIVE_INFINITY);
  }
  return items.slice().sort((a, b) => (km.get(a) ?? Infinity) - (km.get(b) ?? Infinity));
}

/** What the model is told about the place, whichever way the lookup went. */
export function nearSummary(lookup: NearLookup, nearestKm: number | null) {
  if (lookup.status !== "found") {
    return {
      searchedFor: lookup.searchedFor,
      found: null,
      note:
        lookup.status === "not-found"
          ? "That place could not be found on a map, so there are no distances. Ask the visitor where it is, or answer without distances — never estimate one yourself."
          : "Distances are unavailable just now. Answer without them, and do not estimate a distance or a walk yourself.",
    };
  }
  const { place } = lookup;
  return {
    searchedFor: place.searchedFor,
    found: place.address ? `${place.name}, ${place.address}` : place.name,
    note:
      (nearestKm != null && nearestKm > 50
        ? "The place found is more than 50 km from every result — check it is the place the visitor meant before using these distances. "
        : "") +
      "Results are nearest first. distanceKm is straight-line; walkMinutes allows for streets and is an estimate, so say \"about N minutes on foot\". Over about 20 minutes, do not call it an easy walk; where walkMinutes is null it is not walking distance at all.",
  };
}
