import "server-only";
import { distinctSorted } from "@/lib/hotelOptions";
import { hotelInMacroRegion, MACRO_REGIONS } from "@/lib/ai/macroRegions";
import { AREA_ALIAS_TERMS } from "@/lib/ai/macroRegionTerms";

export type SuggestionType =
  | "hotel"
  | "city"
  | "state"
  | "admin_region"
  | "country"
  | "macro_region"
  | "region"
  | "purpose"
  | "setting";

export type SuggestionTaxOption = {
  id: string;
  label: string;
};

export type SuggestionHotelRow = {
  hotel_name: string;
  city: string;
  /** Directus `state_province_county_island` — the mid-level geography
   * (Tuscany, Bali, Santorini, Provence). Narrower than `country`, broader
   * than `city`. Not to be confused with `region`, which is a continent. */
  state: string;
  /** Directus `admin_region` — the administrative unit (Lombardy, Valais,
   * Kyoto Prefecture). May legitimately equal `state` where the admin unit is
   * also what a traveller types (Tuscany, Bali). */
  admin_region: string;
  country: string;
  region: string;
  /** The colloquial regions this hotel belongs to ("The Alps", "The
   * Mediterranean") — no column holds these; they are the concierge's
   * MACRO_REGIONS, evaluated per row here so the browser need not carry the
   * definitions. */
  macro_regions: string[];
  activities: string[];
  settings: string[];
};

export type HotelSuggestionDataset = {
  hotels: SuggestionHotelRow[];
  purposes: SuggestionTaxOption[];
  settings: SuggestionTaxOption[];
  /** Traveller names for a stored area ("French Riviera" for the Côte d'Azur),
   * offered only where that area holds a hotel. */
  areaAliases: { label: string; area: string }[];
};

function toOptions(values: string[]): SuggestionTaxOption[] {
  return values.map((v) => ({ id: v, label: v }));
}

// Sync builder — accepts rows already fetched by the caller (no Directus call).
// Rows must include: hotel_name, city, state_province_county_island,
// admin_region, country, region, activities, setting.
export function buildHotelSuggestionDataset(rows: any[]): HotelSuggestionDataset {
  const hotels: SuggestionHotelRow[] = rows
    .map((row) => {
      const hotel = {
        hotel_name: (row.hotel_name ?? "").trim(),
        city: (row.city ?? "").trim(),
        state: (row.state_province_county_island ?? "").trim(),
        admin_region: (row.admin_region ?? "").trim(),
        country: (row.country ?? "").trim(),
        region: (row.region ?? "").trim(),
        activities: Array.isArray(row.activities) ? row.activities : [],
        settings: Array.isArray(row.setting) ? row.setting : [],
      };
      const macro_regions = MACRO_REGIONS.filter((macro) =>
        hotelInMacroRegion({ ...hotel, setting: hotel.settings }, macro)
      ).map((macro) => macro.name);
      return { ...hotel, macro_regions };
    })
    .filter(
      (row) =>
        row.hotel_name ||
        row.city ||
        row.state ||
        row.admin_region ||
        row.country ||
        row.region ||
        row.activities.length > 0 ||
        row.settings.length > 0
    );

  const purposes = toOptions(distinctSorted(rows.flatMap((r) => r.activities ?? [])));
  const settings = toOptions(distinctSorted(rows.flatMap((r) => r.setting ?? [])));

  const areas = new Set(hotels.map((hotel) => hotel.state));
  const areaAliases = AREA_ALIAS_TERMS.filter((term) => areas.has(term.area)).map(
    ({ label, area }) => ({ label, area })
  );

  return { hotels, purposes, settings, areaAliases };
}
