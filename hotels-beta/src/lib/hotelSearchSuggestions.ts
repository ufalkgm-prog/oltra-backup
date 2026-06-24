import "server-only";
import { distinctSorted } from "@/lib/hotelOptions";

export type SuggestionType =
  | "hotel"
  | "city"
  | "country"
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
  country: string;
  region: string;
  activities: string[];
  settings: string[];
};

export type HotelSuggestionDataset = {
  hotels: SuggestionHotelRow[];
  purposes: SuggestionTaxOption[];
  settings: SuggestionTaxOption[];
};

function toOptions(values: string[]): SuggestionTaxOption[] {
  return values.map((v) => ({ id: v, label: v }));
}

// Sync builder — accepts rows already fetched by the caller (no Directus call).
// Rows must include: hotel_name, city, country, region, activities, setting.
export function buildHotelSuggestionDataset(rows: any[]): HotelSuggestionDataset {
  const hotels: SuggestionHotelRow[] = rows
    .map((row) => ({
      hotel_name: (row.hotel_name ?? "").trim(),
      city: (row.city ?? "").trim(),
      country: (row.country ?? "").trim(),
      region: (row.region ?? "").trim(),
      activities: Array.isArray(row.activities) ? row.activities : [],
      settings: Array.isArray(row.setting) ? row.setting : [],
    }))
    .filter(
      (row) =>
        row.hotel_name ||
        row.city ||
        row.country ||
        row.region ||
        row.activities.length > 0 ||
        row.settings.length > 0
    );

  const purposes = toOptions(distinctSorted(rows.flatMap((r) => r.activities ?? [])));
  const settings = toOptions(distinctSorted(rows.flatMap((r) => r.setting ?? [])));

  return { hotels, purposes, settings };
}
