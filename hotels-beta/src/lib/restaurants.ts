import { directusFetchJson } from "@/lib/directus";
import { haversineKm } from "@/lib/geoDistance";
import { foldedContains, foldForSearch } from "@/lib/searchFold";
import type { RestaurantRecord } from "@/app/restaurants/types";

type DirectusRestaurantRow = {
  id: number;
  status?: string | null;
  sort?: number | null;
  rank?: number | null;
  restaurant_name?: string | null;
  slug?: string | null;
  description?: string | null;
  restaurant_type?: string | null;
  highlights?: string | null;
  cuisine?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  local_area?: string | null;
  state_province_county_island?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  www?: string | null;
  insta?: string | null;
  restaurant_setting?: string | null;
  restaurant_style?: string | null;
  awards?: unknown;
  hotel_name_hint?: string | null;
  sources?: string | null;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAwards(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

// The shared search fold (lib/searchFold.ts): case, accents, dashes, "St".
function normalizeCityKey(value: string | null | undefined): string {
  return foldForSearch(value);
}

export function normalizeRestaurant(row: DirectusRestaurantRow): RestaurantRecord {
  return {
    id: row.id,
    status: row.status ?? null,
    sort: row.sort ?? null,
    rank: row.rank ?? null,
    restaurant_name: row.restaurant_name?.trim() || "Untitled restaurant",
    slug: row.slug ?? null,
    description: row.description ?? null,
    restaurant_type: row.restaurant_type ?? null,
    highlights: row.highlights ?? null,
    cuisine: row.cuisine ?? null,
    country: row.country ?? null,
    region: row.region ?? null,
    city: row.city ?? null,
    local_area: row.local_area ?? null,
    state_province_county_island: row.state_province_county_island ?? null,
    lat: toNumber(row.lat),
    lng: toNumber(row.lng),
    www: row.www ?? null,
    insta: row.insta ?? null,
    restaurant_setting: row.restaurant_setting ?? null,
    restaurant_style: row.restaurant_style ?? null,
    awards: normalizeAwards(row.awards),
    hotel_name_hint: row.hotel_name_hint ?? null,
    sources: row.sources ?? null,
  };
}

function buildRestaurantFields() {
  return [
    "id",
    "status",
    "sort",
    "rank",
    "restaurant_name",
    "slug",
    "description",
    "restaurant_type",
    "highlights",
    "cuisine",
    "country",
    "region",
    "city",
    "local_area",
    "state_province_county_island",
    "lat",
    "lng",
    "www",
    "insta",
    "restaurant_setting",
    "restaurant_style",
    "awards",
    "hotel_name_hint",
    "sources",
  ].join(",");
}

export async function getRestaurantCities(): Promise<string[]> {
  const params = new URLSearchParams({
    fields: "city",
    "filter[status][_eq]": "published",
    sort: "city",
    limit: "-1",
  });

  const rows = await directusFetchJson<Pick<DirectusRestaurantRow, "city">[]>(
    `/items/restaurants?${params.toString()}`
  );

  const cityMap = new Map<string, string>();

  for (const row of rows ?? []) {
    const originalCity = normalizeText(row.city);
    if (!originalCity) continue;

    const key = normalizeCityKey(originalCity);
    if (!cityMap.has(key)) {
      cityMap.set(key, originalCity);
    }
  }

  return Array.from(cityMap.values()).sort((a, b) => a.localeCompare(b));
}

/* Full records for a set of ids - used by Members > Favorite restaurants,
 * which stores only a name and a location label per favourite and needs the
 * same editorial text the Restaurants page shows. */
export async function getRestaurantsByIds(
  ids: string[]
): Promise<RestaurantRecord[]> {
  const wanted = ids.map((id) => String(id).trim()).filter(Boolean);
  if (!wanted.length) return [];

  const params = new URLSearchParams({
    fields: buildRestaurantFields(),
    "filter[id][_in]": wanted.join(","),
    limit: "-1",
  });

  const rows = await directusFetchJson<DirectusRestaurantRow[]>(
    `/items/restaurants?${params.toString()}`
  );

  return (rows ?? []).map(normalizeRestaurant);
}

/* Candidate lookup for the AI concierge.
 *
 * Built on getRestaurantsByCity rather than a second Directus query, so the
 * concierge sees exactly the set the Restaurants page would show for that city
 * — including its alias fallback, which is what makes Ramatuelle resolve to
 * Saint-Tropez. Cuisine and type narrow in JS afterwards: both are short free
 * text on the record, and a Directus _eq on them would miss "Modern French"
 * when the model asked for "French".
 *
 * Read-only, published records only, same as everything else the concierge
 * reaches. */
export async function searchRestaurants(input: {
  city: string;
  cuisine?: string;
  restaurantType?: string;
  limit?: number;
  /** Order nearest-first to this point before the limit is applied, so a
   * "near the Pantheon" question is cut to the closest rather than the first. */
  nearest?: { lat: number; lng: number };
}): Promise<RestaurantRecord[]> {
  const rows = await getRestaurantsByCity(input.city);

  const cuisine = normalizeText(input.cuisine).toLowerCase();
  const type = normalizeText(input.restaurantType).toLowerCase();

  const narrowed = rows.filter((row) => {
    if (cuisine && !normalizeText(row.cuisine).toLowerCase().includes(cuisine)) {
      return false;
    }
    if (type && normalizeText(row.restaurant_type).toLowerCase() !== type) {
      return false;
    }
    return true;
  });

  const origin = input.nearest;
  if (origin) {
    const km = (row: RestaurantRecord) =>
      row.lat == null || row.lng == null
        ? Number.POSITIVE_INFINITY
        : haversineKm(origin.lat, origin.lng, Number(row.lat), Number(row.lng));
    narrowed.sort((a, b) => km(a) - km(b));
  }

  const limit = Math.max(1, Math.min(input.limit ?? 30, 60));
  return narrowed.slice(0, limit);
}

export async function getRestaurantsByCity(city: string): Promise<RestaurantRecord[]> {
  const requestedCity = normalizeText(city);
  if (!requestedCity) return [];

  const params = new URLSearchParams({
    fields: buildRestaurantFields(),
    sort: "rank,sort,restaurant_name",
    "filter[status][_eq]": "published",
    "filter[city][_eq]": requestedCity,
    limit: "-1",
  });

  const rows = await directusFetchJson<DirectusRestaurantRow[]>(
    `/items/restaurants?${params.toString()}`
  );

  const exactCityMatches = (rows ?? []).map(normalizeRestaurant);

  if (exactCityMatches.length > 0) {
    return exactCityMatches;
  }

  const fallbackParams = new URLSearchParams({
    fields: buildRestaurantFields(),
    sort: "rank,sort,restaurant_name",
    "filter[status][_eq]": "published",
    limit: "-1",
  });

  const fallbackRows = await directusFetchJson<DirectusRestaurantRow[]>(
    `/items/restaurants?${fallbackParams.toString()}`
  );

  return (fallbackRows ?? []).map(normalizeRestaurant).filter((r) =>
    [r.city, r.local_area, r.region, r.country, r.state_province_county_island].some((value) =>
      foldedContains(value, requestedCity)
    )
  );
}