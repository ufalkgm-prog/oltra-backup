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
    cache: "no-store",
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
  return directusRequest<T[]>(`/items/${collection}`, { query });
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
  hotelid: string | null;
  published: boolean;

  affiliation?: string | null;
  region?: string | null;
  country?: string | null;
  state_province__county__island?: string | null;
  city?: string | null;
  local_area?: string | null;

  activities?: unknown[] | null;
  awards?: unknown[] | null;
  settings?: unknown[] | null;
  styles?: unknown[] | null;

  highlights?: string | null;
  description?: string | null;

  ext_points?: number | null;
  editor_rank_13?: number | null;
  total_rooms_suites_villas?: number | null;
  rooms_suites?: number | null;
  villas?: number | null;
  high_season?: string | null;
  low_season?: string | null;
  rain_season?: string | null;

  www?: string | null;
  insta?: string | null;

  booking_provider?: "booking" | "cj_booking" | "official" | "none" | null;
  booking_url?: string | null;
  booking_hotel_ref?: string | null;
  booking_enabled?: boolean | null;
  booking_label?: string | null;
  booking_notes?: string | null;
  official_website_booking_url?: string | null;
};

export async function getHotels(query: DirectusQuery): Promise<HotelRecord[]> {
  return getItems<HotelRecord>("hotels", query);
}