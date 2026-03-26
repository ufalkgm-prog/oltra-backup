// src/lib/hotelFilters.ts
import "server-only";
import type { DirectusFilter } from "@/lib/directus";

export type HotelsSearchParams = Record<string, string | string[] | undefined>;

const LIST_DELIM = ",";

// Canonical field names (must match Directus exactly)
export const HOTEL_FILTER_FIELDS = {
  affiliation: "affiliation",
  region: "region",
  country: "country",
  state: "state_province__county__island",
  city: "city",
  local_area: "local_area",

  activities: "activities",
  awards: "awards",
  settings: "settings",
  styles: "styles",
} as const;

export type HotelFilterKey = keyof typeof HOTEL_FILTER_FIELDS;

/**
 * Parse a query param value into a list:
 * - supports `?country=Italy,France`
 * - supports `?country=Italy&country=France` (string[])
 */
function parseList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const raw = Array.isArray(v) ? v.join(LIST_DELIM) : v;
  return raw
    .split(LIST_DELIM)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Builds a Directus filter object for /items/hotels.
 * - Always enforces: published = true
 * - For scalar fields: uses `_in`
 * - For relational fields: uses `_some` with a best-effort match on `name` or `title`
 *
 * Note: relational schemas differ (e.g., junction tables vs direct m2m).
 * This keeps structure small and safe; adjust once your Directus relational shape is confirmed.
 */
export function buildHotelsDirectusFilter(
  searchParams: HotelsSearchParams
): DirectusFilter {
  const and: DirectusFilter[] = [{ published: { _eq: true } }];

  const scalarMappings: Array<[HotelFilterKey, string]> = [
    ["affiliation", HOTEL_FILTER_FIELDS.affiliation],
    ["region", HOTEL_FILTER_FIELDS.region],
    ["country", HOTEL_FILTER_FIELDS.country],
    ["state", HOTEL_FILTER_FIELDS.state],
    ["city", HOTEL_FILTER_FIELDS.city],
    ["local_area", HOTEL_FILTER_FIELDS.local_area],
  ];

  for (const [key, field] of scalarMappings) {
    const values = parseList(searchParams[key]);
    if (values.length) {
      and.push({ [field]: { _in: values } });
    }
  }

const relationalMappings: Array<[HotelFilterKey, string, string]> = [
  ["activities", HOTEL_FILTER_FIELDS.activities, "activities_id"],
  ["awards", HOTEL_FILTER_FIELDS.awards, "awards_id"],
  ["settings", HOTEL_FILTER_FIELDS.settings, "settings_id"],
  ["styles", HOTEL_FILTER_FIELDS.styles, "styles_id"],
];

for (const [key, field, relationIdField] of relationalMappings) {
  const values = parseList(searchParams[key]);
  if (!values.length) continue;

  and.push({
    [field]: {
      _some: {
        [relationIdField]: {
          _in: values,
        },
      },
    },
  });
}

  const q = (searchParams.q ?? "").toString().trim();
  if (q) {
    // Directus "search" is separate, but we can also filter across key text fields.
    // Keeping filter-only here; the caller can also pass `search` query.
    and.push({
      _or: [
        { hotel_name: { _icontains: q } },
        { highlights: { _icontains: q } },
        { description: { _icontains: q } },
        { city: { _icontains: q } },
        { country: { _icontains: q } },
      ],
    });
  }

  return and.length === 1 ? and[0] : { _and: and };
}

export function serializeList(values: string[]): string {
  return values.join(LIST_DELIM);
}