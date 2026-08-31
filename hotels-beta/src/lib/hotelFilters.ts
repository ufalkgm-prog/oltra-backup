// src/lib/hotelFilters.ts
import "server-only";
import type { DirectusFilter } from "@/lib/directus";
import { AWARD_CODES } from "@/lib/hotels/awardCodes";

export type HotelsSearchParams = Record<string, string | string[] | undefined>;

const LIST_DELIM = ",";

// Canonical field names (must match Directus exactly)
export const HOTEL_FILTER_FIELDS = {
  affiliation: "affiliation",
  region: "region",
  country: "country",
  state: "state_province_county_island",
  admin_region: "admin_region",
  city: "city",
  local_area: "local_area",
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
 * - For the award boolean columns: uses `_or` of `_eq: true` checks
 *
 * Note: `activities`/`awards`/`setting`/`style` are native Postgres text[]
 * columns. Directus's `_contains`/`_in` operators error against them
 * (confirmed live), so activities/setting/style filtering happens as a
 * JS-side pass on the fetched rows instead — see app/hotels/page.tsx.
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
    ["admin_region", HOTEL_FILTER_FIELDS.admin_region],
    ["city", HOTEL_FILTER_FIELDS.city],
    ["local_area", HOTEL_FILTER_FIELDS.local_area],
  ];

  for (const [key, field] of scalarMappings) {
    const values = parseList(searchParams[key]);
    if (values.length) {
      and.push({ [field]: { _in: values } });
    }
  }

  const awardCodes = parseList(searchParams.awards).filter((code): code is string =>
    (AWARD_CODES as readonly string[]).includes(code)
  );
  if (awardCodes.length) {
    and.push({
      _or: awardCodes.map((code) => ({ [code]: { _eq: true } })),
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

/**
 * JS-side filter for the activities/setting/style multiselect tag fields.
 * Directus can't filter these natively (see note above), so this runs on
 * the already-fetched rows. A hotel matches a field if its tag array
 * overlaps at least one selected value (OR within a field, AND across the
 * three fields) — the same semantics the old M2M `_some`/`_in` filter intended.
 */
export function filterHotelsByTags<
  T extends { activities?: string[] | null; setting?: string[] | null; style?: string[] | null }
>(
  hotels: T[],
  selected: { activities: string[]; settings: string[]; styles: string[] }
): T[] {
  const overlaps = (values: string[] | null | undefined, selectedValues: string[]): boolean => {
    if (!selectedValues.length) return true;
    const set = new Set(values ?? []);
    return selectedValues.some((v) => set.has(v));
  };

  if (!selected.activities.length && !selected.settings.length && !selected.styles.length) {
    return hotels;
  }

  return hotels.filter(
    (hotel) =>
      overlaps(hotel.activities, selected.activities) &&
      overlaps(hotel.setting, selected.settings) &&
      overlaps(hotel.style, selected.styles)
  );
}