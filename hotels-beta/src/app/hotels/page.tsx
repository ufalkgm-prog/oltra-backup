import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import { getHotels } from "@/lib/directus";
import {
  buildHotelsDirectusFilter,
  filterHotelsByMacroRegion,
  filterHotelsByTags,
} from "@/lib/hotelFilters";
import { buildHotelFilterOptions } from "@/lib/hotelOptions";
import { buildHotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import { expandCityAliases } from "@/lib/locationAliases";
import HotelsView from "./ui/HotelsView";

function toIdentityMap(values: string[]): Map<string, string> {
  return new Map(values.map((v) => [v, v]));
}

export const metadata: Metadata = {
  title: "Hotels",
  description: "Curated luxury hotels, editorial-first.",
};

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams: Promise<SearchParams>;
};

function normalizeParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

function listFromParam(v: string | string[] | undefined): string[] {
  const s = normalizeParam(v);
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export default async function HotelsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;

const filter = buildHotelsDirectusFilter(resolvedSearchParams);

const q = normalizeParam(resolvedSearchParams.q).trim();

const country = listFromParam(resolvedSearchParams.country);
const city = expandCityAliases(listFromParam(resolvedSearchParams.city));
// `state` maps to Directus `state_province_county_island` — see
// HOTEL_FILTER_FIELDS in lib/hotelFilters.
const state = listFromParam(resolvedSearchParams.state);
const admin_region = listFromParam(resolvedSearchParams.admin_region);
// Set by the AI concierge handoff. Restricts the page to exactly the properties
// it recommended; absent for every normal search.
const ids = listFromParam(resolvedSearchParams.ids).filter((id) =>
  /^[0-9]+$/.test(id)
);
const region = listFromParam(resolvedSearchParams.region);
// A colloquial region chosen in the destination field ("The Alps") — see
// filterHotelsByMacroRegion.
const macro_region = listFromParam(resolvedSearchParams.macro_region);
const local_area = listFromParam(resolvedSearchParams.local_area);
const affiliation = listFromParam(resolvedSearchParams.affiliation);
const activities = listFromParam(resolvedSearchParams.activities);
const awards = listFromParam(resolvedSearchParams.awards);
const settings = listFromParam(resolvedSearchParams.settings);
const styles = listFromParam(resolvedSearchParams.styles);

const landing_handoff =
  q ||
  country.length ||
  city.length ||
  state.length ||
  admin_region.length ||
  ids.length ||
  region.length ||
  macro_region.length
    ? "1"
    : "";

const selected = {
  q,
  country,
  city,
  state,
  admin_region,
  ids,
  region,
  macro_region,
  local_area,
  affiliation,
  activities,
  awards,
  settings,
  styles,
  filters_open: normalizeParam(resolvedSearchParams.filters_open),
  search_submitted: normalizeParam(resolvedSearchParams.search_submitted),
  landing_handoff,
};

// This list is fetched for EVERY published hotel in one request (limit: -1), so
// a field added here is paid for ~800 times per page load. Never add
// `ratehawk_room_groups` (~19 MB across the roster) or ratehawk_image_2..50 —
// both are read per-hotel on demand instead. See CLAUDE.md §29 and §32.
//
// Nor `description` (2026-09-15): with it the response was 2.8-3.7 MB, over
// the 2 MB Next.js data cache limit, so it was never cached and every visit
// re-downloaded the roster from Directus — 11s to navigate here from the
// header. It is read for the selected hotel only, from
// /api/hotels/[id]/description. Keep this response under 2 MB.
const hotelFields = [
  "id",
  "hotel_name",
  "published",
  "country",
  "region",
  "city",
  "local_area",
  "lat",
  "lng",
  "highlights",
  "www",
  "insta",
  "editor_rank",
  "ext_points",
  "affiliation",
  "ratehawk_image_1",
  "ratehawk_image_1_category",
  "booking_provider",
  "booking_URL",
  "booking_hotel_ref",
  "booking_enabled",
  "booking_label",
  "booking_notes",
  "ratehawk_hid",
  "ratehawk_status",
  "activities",
  "awards",
  "setting",
  "style",
  "best50",
  "cn",
  "forbes5",
  "michelin3keys",
  "telegraph",
  "tl100",
  "aaa5d",
] as const;

// Lightweight fetch of all published hotels for filter dropdowns and search
// suggestions. Fetched once and passed to sync builders — no separate calls.
const metaFields = [
  "hotel_name",
  "affiliation",
  "region",
  "country",
  "state_province_county_island",
  "admin_region",
  "city",
  "local_area",
  "activities",
  "awards",
  "setting",
  "style",
] as const;

const [metaHotels, hotelsRawAll] = await Promise.all([
  getHotels({
    fields: metaFields as unknown as string[],
    filter: { published: { _eq: true } },
    limit: -1,
  }),
  getHotels({
    fields: hotelFields as unknown as string[],
    // Always the built filter, which enforces published = true: without
    // search filters this used to be no filter at all, fetching the ~100
    // unpublished rows only to drop them below.
    filter,
    sort: ["-editor_rank", "-ext_points", "hotel_name"],
    limit: -1,
  }),
]);

const options = buildHotelFilterOptions(metaHotels);
const tax = {
  activities: toIdentityMap(options.activities),
  settings: toIdentityMap(options.settings),
};
const suggestions = buildHotelSuggestionDataset(metaHotels);

const hotelsRaw = filterHotelsByMacroRegion(
  filterHotelsByTags(hotelsRawAll, { activities, settings, styles }),
  resolvedSearchParams
);
const hotelsPublished = hotelsRaw.filter((hotel) => hotel.published === true);

const hotels = hotelsPublished;

  return (
    <PageShell current="Hotels">
      <HotelsView
        hotels={hotels}
        options={options}
        tax={tax}
        suggestions={suggestions}
        searchParams={resolvedSearchParams}
        selected={selected}
      />
    </PageShell>
  );
}