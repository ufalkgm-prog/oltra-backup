import "server-only";
import { getHotels } from "@/lib/directus";
import { fetchAllHotelTaxonomies } from "@/lib/directus/taxonomy";

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

export async function getHotelSuggestionDataset(): Promise<HotelSuggestionDataset> {
  const [rows, tax] = await Promise.all([
    getHotels({
      fields: [
        "hotel_name",
        "city",
        "country",
        "region",
        "activities.activities_id.id",
        "activities.activities_id.name",
        "settings.settings_id.id",
        "settings.settings_id.name",
      ],
      filter: { published: { _eq: true } },
      sort: ["hotel_name"],
      limit: 1000,
    }),
    fetchAllHotelTaxonomies(),
  ]);

  const hotels: SuggestionHotelRow[] = rows
    .map((row: any) => ({
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