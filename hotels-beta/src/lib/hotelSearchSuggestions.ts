import "server-only";

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

function extractNestedIds(
  items: any[] | null | undefined,
  nestedKey: "activities_id" | "settings_id"
): string[] {
  if (!Array.isArray(items)) return [];

  return Array.from(
    new Set(
      items
        .map((item) => {
          const nested = item?.[nestedKey];
          if (nested?.id == null) return null;
          return String(nested.id);
        })
        .filter(Boolean) as string[]
    )
  );
}

type TaxMaps = {
  activities: Map<string, string>;
  settings: Map<string, string>;
};

// Sync builder — accepts rows and taxonomy maps already fetched by the caller.
// Rows must include: hotel_name, city, country, region,
//   activities.activities_id.id, activities.activities_id.name,
//   settings.settings_id.id, settings.settings_id.name
export function buildHotelSuggestionDataset(
  rows: any[],
  tax: TaxMaps
): HotelSuggestionDataset {
  const hotels: SuggestionHotelRow[] = rows
    .map((row) => ({
      hotel_name: (row.hotel_name ?? "").trim(),
      city: (row.city ?? "").trim(),
      country: (row.country ?? "").trim(),
      region: (row.region ?? "").trim(),
      activities: extractNestedIds(row.activities, "activities_id"),
      settings: extractNestedIds(row.settings, "settings_id"),
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

  const purposes = Array.from(tax.activities.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const settings = Array.from(tax.settings.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { hotels, purposes, settings };
}
