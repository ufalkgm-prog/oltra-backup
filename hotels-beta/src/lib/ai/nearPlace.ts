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

/** A large place's outline, as Google's viewport box. Present only when the
 * box is over LARGE_PLACE_KM across — see distanceFromPlace. */
export type PlaceBounds = { north: number; south: number; east: number; west: number };

export type NearPlace = {
  searchedFor: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  bounds?: PlaceBounds;
};

export type NearLookup =
  | { status: "found"; place: NearPlace }
  | { status: "not-found"; searchedFor: string }
  | { status: "unavailable"; searchedFor: string };

/** Streets are not straight lines; 1.3 is the usual allowance for a city grid. */
const WALK_DETOUR = 1.3;
const WALK_KMH = 5;
/** Past this a walking time is not an answer anyone wants. */
const MAX_WALK_KM = 5;

/* LARGE PLACES GET NO WALKING TIMES (2026-09-15). Google gives one point for
 * "Central Park" — its middle, around 79th Street — so The Pierre, facing the
 * park, measured 2 km and 31 minutes while two Madison Avenue hotels came out
 * nearest. Every result also carries a viewport box: about 0.36 km across for a
 * building or monument (the Pantheon, Harrods), several km for a park or a
 * district (Central Park 5.5, Hyde Park 1.9, Ginza 1.9).
 *
 * Measuring to that box was tried and is NOT a fix: Central Park lies on
 * Manhattan's diagonal grid, so its box reaches down to about 53rd Street, and
 * ten hotels — The Peninsula and the St. Regis among them, blocks from the park
 * — all measured "at the park". A box is the wrong shape for a long, rotated
 * place, and Google gives no outline. So over this size the place is an area:
 * results are ORDERED by distance to its box (coarse, but better than to its
 * middle), and carry no distance or walking time for the model to quote; it is
 * told to judge closeness from each hotel's own highlights and description. */
const LARGE_PLACE_KM = 1;

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
    type LatLng = { lat?: number; lng?: number };
    const data = (await res.json()) as {
      status?: string;
      candidates?: {
        name?: string;
        formatted_address?: string;
        geometry?: { location?: LatLng; viewport?: { northeast?: LatLng; southwest?: LatLng } };
      }[];
    };
    const first = data.candidates?.[0];
    const lat = first?.geometry?.location?.lat;
    const lng = first?.geometry?.location?.lng;

    if (res.ok && data.status === "OK" && typeof lat === "number" && typeof lng === "number") {
      const ne = first?.geometry?.viewport?.northeast;
      const sw = first?.geometry?.viewport?.southwest;
      const box =
        typeof ne?.lat === "number" && typeof ne?.lng === "number" &&
        typeof sw?.lat === "number" && typeof sw?.lng === "number"
          ? { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng }
          : undefined;
      const large =
        box && haversineKm(box.south, box.west, box.north, box.east) > LARGE_PLACE_KM ? box : undefined;
      result = {
        status: "found",
        place: {
          searchedFor,
          name: first?.name ?? searchedFor,
          address: first?.formatted_address ?? "",
          lat,
          lng,
          ...(large ? { bounds: large } : {}),
        },
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

/** Straight-line km to the place: to its point, or for a large place to the
 * nearest edge of its box (coarse — used to order results, never quoted). */
function kmFromPlace(
  place: NearPlace,
  lat: number | string | null | undefined,
  lng: number | string | null | undefined
): number | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
  const b = place.bounds;
  const target = b
    ? { lat: Math.min(b.north, Math.max(b.south, la)), lng: Math.min(b.east, Math.max(b.west, ln)) }
    : { lat: place.lat, lng: place.lng };
  return haversineKm(target.lat, target.lng, la, ln);
}

/** Distance from a POINT place, and a walking estimate while walking is
 * sensible. Null for an area (see LARGE_PLACE_KM): nothing there is quotable. */
export function distanceFromPlace(
  place: NearPlace,
  lat: number | string | null | undefined,
  lng: number | string | null | undefined
): { distanceKm: number; walkMinutes: number | null } | null {
  if (place.bounds) return null;
  const km = kmFromPlace(place, lat, lng);
  if (km === null) return null;
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
    const d = kmFromPlace(place, lat as number, lng as number);
    km.set(item, d ?? Number.POSITIVE_INFINITY);
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
    ...(place.bounds ? { area: true } : {}),
    note: place.bounds
      ? "This is a large area (a park or a district), so there are no distances or walking times: its outline cannot be measured precisely. Results are only roughly ordered by closeness. Judge which hotels are by it or in it from each hotel's own highlights and description, and never give a number of minutes."
      :
      (nearestKm != null && nearestKm > 50
        ? "The place found is more than 50 km from every result — check it is the place the visitor meant before using these distances. "
        : "") +
      "Results are nearest first. distanceKm is straight-line; walkMinutes allows for streets and is an estimate, so say \"about N minutes on foot\". Over about 20 minutes, do not call it an easy walk; where walkMinutes is null it is not walking distance at all.",
  };
}
