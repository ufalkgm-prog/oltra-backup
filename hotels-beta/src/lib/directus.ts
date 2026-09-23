// src/lib/directus.ts
import "server-only";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) {
  throw new Error("Missing env DIRECTUS_URL");
}

type DirectusError = {
  message: string;
};

type DirectusResponse<T> = {
  data: T;
  errors?: DirectusError[];
};

export type DirectusID = string | number;

export type DirectusFilter =
  | Record<string, unknown>
  | {
      _and?: DirectusFilter[];
      _or?: DirectusFilter[];
    };

export type DirectusSort = string | string[];

export type DirectusQuery = {
  fields?: string[] | string;
  filter?: DirectusFilter;
  sort?: DirectusSort;
  limit?: number;
  offset?: number;
  page?: number;
  deep?: Record<string, unknown>;
  search?: string;
};

function toQueryString(query?: DirectusQuery): string {
  if (!query) return "";

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;

    if (key === "filter" || key === "deep") {
      params.set(key, JSON.stringify(value));
      continue;
    }

    if (Array.isArray(value)) {
      params.set(key, value.join(","));
      continue;
    }

    params.set(key, String(value));
  }

  const s = params.toString();
  return s ? `?${s}` : "";
}

async function directusRequest<T>(
  path: string,
  options?: {
    query?: DirectusQuery;
    init?: RequestInit;
  }
): Promise<T> {
  const query = options?.query;
  const init = options?.init;

  const url = `${DIRECTUS_URL}${path}${toQueryString(query)}`;

  const headers = new Headers(init?.headers ?? {});
  headers.set("Accept", "application/json");

  if (DIRECTUS_TOKEN) {
    headers.set("Authorization", `Bearer ${DIRECTUS_TOKEN}`);
  }

  const hasBody = init?.body !== undefined && init?.body !== null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...init,
    headers,
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("DIRECTUS REQUEST URL:", url);
    console.error("DIRECTUS RESPONSE STATUS:", res.status);
    console.error("DIRECTUS RESPONSE BODY:", body);
    throw new Error(`Directus request failed (${res.status}) ${url}\n${body}`);
  }

  const json = (await res.json()) as DirectusResponse<T>;

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("\n"));
  }

  return json.data;
}

export async function directusFetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  return directusRequest<T>(path, { init });
}

export async function getItems<T>(
  collection: string,
  query?: DirectusQuery
): Promise<T[]> {
  const rows = await directusRequest<T[]>(`/items/${collection}`, { query });

  // Supplier images are attached here rather than in getHotels, so that every
  // caller asking for hotels gets them — see attachHotelImages. Rows without an
  // id (a query that selected other fields only) are returned untouched, and
  // the second request is skipped entirely.
  if (collection === "hotels" && rows.length > 0) {
    const hotels = rows as unknown as HotelRecord[];
    if (hotels.some((hotel) => hotel?.id != null)) {
      return (await attachHotelImages(hotels)) as unknown as T[];
    }
  }

  return rows;
}

export async function getItemById<T>(
  collection: string,
  id: DirectusID,
  query?: DirectusQuery
): Promise<T> {
  return directusRequest<T>(`/items/${collection}/${id}`, { query });
}

export async function getSingleton<T>(
  collection: string,
  query?: DirectusQuery
): Promise<T> {
  return directusRequest<T>(`/items/${collection}`, { query });
}

export async function updateItem<T>(
  collection: string,
  id: DirectusID,
  payload: Record<string, unknown>
): Promise<T> {
  return directusRequest<T>(`/items/${collection}/${id}`, {
    init: {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  });
}

// Convenience for hotels
export type HotelRecord = {
  id: string | number;

  hotel_name: string;
  published: boolean;

  affiliation?: string | null;
  region?: string | null;
  country?: string | null;
  state_province_county_island?: string | null;
  city?: string | null;
  local_area?: string | null;

  lat?: number | string | null;
  lng?: number | string | null;

  activities?: string[] | null;
  awards?: string[] | null;
  setting?: string[] | null;
  style?: string[] | null;

  best50?: boolean | null;
  cn?: boolean | null;
  forbes5?: boolean | null;
  michelin3keys?: boolean | null;
  telegraph?: boolean | null;
  tl100?: boolean | null;
  aaa5d?: boolean | null;

  highlights?: string | null;
  description?: string | null;

  ext_points?: number | null;
  editor_rank?: number | null;
  total_rooms_suites_villas?: number | null;

  www?: string | null;
  insta?: string | null;

  /** Supplier images held in Directus, attached by attachHotelImages() rather
   * than stored on the hotels row. Present only where a hotel has rows in the
   * hotel_images collection, and takes priority over the Ratehawk fields.
   * Every image carries the credit its licence requires. */
  directus_images?: { url: string; credit: string | null }[];

  // Hero-only fields from the Ratehawk backfill (CLAUDE.md §28) — the full
  // ratehawk_image_1..50 set is fetched on demand, see
  // src/app/api/hotels/[id]/ratehawk-images/route.ts
  //
  // NEVER add `ratehawk_room_groups` here or to any bulk hotel field list. It
  // holds the synced ETG room-group blob — ~19 MB across the roster, p95 153 KB
  // for a single hotel — and the Hotels page fetches every published hotel in
  // one request. It is read one hotel at a time by loadRatehawkRoomGroups() in
  // src/lib/ratehawk/availability.ts, and nowhere else. Same reasoning that
  // kept ratehawk_image_2..50 out of this type (§29).
  ratehawk_image_1?: string | null;
  ratehawk_image_1_category?: string | null;

  booking_provider?: "booking" | "cj_booking" | "official" | "none" | null;
  booking_URL?: string | null;
  booking_hotel_ref?: string | null;
  booking_enabled?: boolean | null;
  booking_label?: string | null;
  booking_notes?: string | null;
  ratehawk_hid?: number | null;
  /** Whether the hotel is sellable through Ratehawk at all — set offline by
   * scripts/ratehawk/probe-ratehawk-status.mjs, not by a live check. "passive"
   * means never bookable there for any date, which is a different thing from a
   * live search returning no rooms for the chosen dates. */
  ratehawk_status?: "active" | "passive" | "not_integrated" | null;
};

export async function getHotels(query: DirectusQuery): Promise<HotelRecord[]> {
  return getItems<HotelRecord>("hotels", query);
}

/**
 * Attaches the Directus-held supplier images to each hotel.
 *
 * Applied by getItems to every hotels query, not by getHotels alone. It lived
 * on getHotels first, and the concierge card route — which calls getItems
 * directly — served placeholders for the four lodges whose Ratehawk refs had
 * been cleared, because their images were simply never attached. Any caller
 * that asks for hotels should get their images.
 *
 * Kept as a second request rather than a nested field: hotel_images is its own
 * collection with no alias field on hotels, and one filtered request for the
 * whole page costs less than deep-expanding every row. A failure here must not
 * take the page down — the hotels fall back to their Ratehawk images.
 */
async function attachHotelImages(hotels: HotelRecord[]): Promise<HotelRecord[]> {
  const ids = hotels.map((hotel) => hotel.id).filter(Boolean);
  if (ids.length === 0) return hotels;

  try {
    const { getHotelImagesByHotelIds } = await import("@/lib/hotels/hotelImages");
    const byHotel = await getHotelImagesByHotelIds(ids);
    if (byHotel.size === 0) return hotels;

    return hotels.map((hotel) => {
      const images = byHotel.get(String(hotel.id));
      if (!images?.length) return hotel;
      return {
        ...hotel,
        directus_images: images.map((image) => ({ url: image.url, credit: image.credit })),
      };
    });
  } catch (error) {
    console.error("HOTEL IMAGES FETCH FAILED:", error);
    return hotels;
  }
}