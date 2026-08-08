import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import { getHotels } from "@/lib/directus";
import { buildHotelsDirectusFilter, filterHotelsByTags } from "@/lib/hotelFilters";
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
const region = listFromParam(resolvedSearchParams.region);
const local_area = listFromParam(resolvedSearchParams.local_area);
const affiliation = listFromParam(resolvedSearchParams.affiliation);
const activities = listFromParam(resolvedSearchParams.activities);
const awards = listFromParam(resolvedSearchParams.awards);
const settings = listFromParam(resolvedSearchParams.settings);
const styles = listFromParam(resolvedSearchParams.styles);

const landing_handoff =
  q || country.length || city.length || region.length ? "1" : "";

const selected = {
  q,
  country,
  city,
  region,
  local_area,
  affiliation,
  activities,
  awards,
  settings,
  styles,
  filters_open: normalizeParam(resolvedSearchParams.filters_open),
  search_submitted: normalizeParam(resolvedSearchParams.search_submitted),
  landing_handoff: q || country.length || city.length || region.length ? "1" : "",
};

const hasMeaningfulFilters = Boolean(
  q ||
    selected.country.length ||
    selected.city.length ||
    selected.region.length ||
    selected.local_area.length ||
    selected.affiliation.length ||
    selected.activities.length ||
    selected.awards.length ||
    selected.settings.length ||
    selected.styles.length
);

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
  "description",
  "affiliation",
  "agoda_photo1",
  "agoda_photo2",
  "agoda_photo3",
  "agoda_photo4",
  "agoda_photo5",
  "ratehawk_image_1",
  "ratehawk_image_1_category",
  "booking_provider",
  "booking_URL",
  "booking_hotel_ref",
  "booking_enabled",
  "booking_label",
  "booking_notes",
  "agoda_hotel_id",
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
    filter: hasMeaningfulFilters ? filter : undefined,
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

const hotelsRaw = filterHotelsByTags(hotelsRawAll, { activities, settings, styles });
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