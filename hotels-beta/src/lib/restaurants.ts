import { directusFetchJson } from "@/lib/directus";
import type { RestaurantRecord } from "@/app/restaurants/types";

type DirectusRestaurantRow = {
  id: number;
  status?: string | null;
  sort?: number | null;
  rank?: number | null;

  restaurant_name?: string | null;
  slug?: string | null;

  description?: string | null;
  highlights?: string | null;
  cuisine?: string | null;

  country?: string | null;
  region?: string | null;
  city?: string | null;
  local_area?: string | null;
  state_province__county__island?: string | null;

  lat?: number | string | null;
  lng?: number | string | null;

  www?: string | null;
  insta?: string | null;

  restaurant_setting?: string | null;
  restaurant_style?: string | null;

  awards?: unknown;
  hotel_name_hint?: string | null;
  sources?: string | null;
  hotels?: unknown[] | null;
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

function normalizeCityKey(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase();
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
    highlights: row.highlights ?? null,
    cuisine: row.cuisine ?? null,

    country: row.country ?? null,
    region: row.region ?? null,
    city: row.city ?? null,
    local_area: row.local_area ?? null,
    state_province__county__island: row.state_province__county__island ?? null,

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
    "highlights",
    "cuisine",
    "country",
    "region",
    "city",
    "local_area",
    "state_province__county__island",
    "lat",
    "lng",
    "www",
    "insta",
    "restaurant_setting",
    "restaurant_style",
    "awards",
    "hotel_name_hint",
    "sources",
    "hotels",
  ].join(",");
}

export async function getRestaurantCities(): Promise<string[]> {
  const params = new URLSearchParams({
    fields: "city,status",
    sort: "city",
    limit: "500",
  });

  const rows = await directusFetchJson<Pick<DirectusRestaurantRow, "city" | "status">[]>(
    `/items/restaurants?${params.toString()}`
  );

  const cityMap = new Map<string, string>();

  for (const row of rows ?? []) {
    if (row.status !== "published") continue;

    const originalCity = normalizeText(row.city);
    if (!originalCity) continue;

    const key = normalizeCityKey(originalCity);
    if (!cityMap.has(key)) {
      cityMap.set(key, originalCity);
    }
  }

  return Array.from(cityMap.values()).sort((a, b) => a.localeCompare(b));
}

export async function getRestaurantsByCity(city: string): Promise<RestaurantRecord[]> {
  const requestedCity = normalizeText(city);

  if (!requestedCity) return [];

  const params = new URLSearchParams({
    fields: buildRestaurantFields(),
    sort: "rank,sort,restaurant_name",
    limit: "200",
  });

  const rows = await directusFetchJson<DirectusRestaurantRow[]>(
    `/items/restaurants?${params.toString()}`
  );

  const allRows = (rows ?? []).map(normalizeRestaurant);
  const cityKey = normalizeCityKey(requestedCity);

  const exactCityMatches = allRows.filter((r) => {
    return r.status === "published" && normalizeCityKey(r.city) === cityKey;
  });

  if (exactCityMatches.length > 0) {
    return exactCityMatches;
  }

  const fallbackMatches = allRows.filter((r) => {
    if (r.status !== "published") return false;

    const haystack = [
      r.city,
      r.local_area,
      r.region,
      r.country,
      r.state_province__county__island,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(cityKey);
  });

  return fallbackMatches;
}