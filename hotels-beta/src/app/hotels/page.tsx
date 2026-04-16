import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import { getHotels } from "@/lib/directus";
import { buildHotelsDirectusFilter } from "@/lib/hotelFilters";
import { getHotelFilterOptions } from "@/lib/hotelOptions";
import { fetchAllHotelTaxonomies } from "@/lib/directus/taxonomy";
import { getHotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import HotelsView from "./ui/HotelsView";

export const metadata: Metadata = {
  title: "Hotels — OLTRA",
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

const selected = {
  q,
  country: listFromParam(resolvedSearchParams.country),
  city: listFromParam(resolvedSearchParams.city),
  region: listFromParam(resolvedSearchParams.region),
  local_area: listFromParam(resolvedSearchParams.local_area),
  affiliation: listFromParam(resolvedSearchParams.affiliation),
  activities: listFromParam(resolvedSearchParams.activities),
  awards: listFromParam(resolvedSearchParams.awards),
  settings: listFromParam(resolvedSearchParams.settings),
  styles: listFromParam(resolvedSearchParams.styles),
  filters_open: normalizeParam(resolvedSearchParams.filters_open),
  search_submitted: normalizeParam(resolvedSearchParams.search_submitted),
};

const hasMeaningfulFilters = Boolean(
  selected.q ||
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

const [options, hotels, tax, suggestions] = await Promise.all([
  getHotelFilterOptions(),
  hasMeaningfulFilters
    ? getHotels({
        fields: [
          "id",
          "hotel_name",
          "hotelid",
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
          "editor_rank_13",
          "ext_points",
          "description",
          "affiliation",
          "booking_provider",
          "booking_url",
          "booking_hotel_ref",
          "booking_enabled",
          "booking_label",
          "booking_notes",
          "official_website_booking_url",
          "activities.activities_id.id",
          "activities.activities_id.name",
          "settings.settings_id.id",
          "settings.settings_id.name",
          "awards.awards_id.id",
          "awards.awards_id.name",
          "styles.styles_id.id",
          "styles.styles_id.name",
        ],
        filter,
        sort: ["-editor_rank_13", "-ext_points", "hotel_name"],
        limit: -1,
      })
    : Promise.resolve([]),
  fetchAllHotelTaxonomies(),
  getHotelSuggestionDataset(),
]);

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