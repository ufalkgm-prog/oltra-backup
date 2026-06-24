// src/lib/hotelOptions.ts
import "server-only";

export type HotelFilterOptions = {
  affiliation: string[];
  region: string[];
  country: string[];
  state_province_county_island: string[];
  city: string[];
  local_area: string[];

  activities: string[];
  awards: string[];
  settings: string[];
  styles: string[];
};

export function distinctSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function distinctFromArrays(rows: any[], key: string): string[] {
  return distinctSorted(rows.flatMap((r) => (Array.isArray(r?.[key]) ? r[key] : [])));
}

// Sync builder — accepts rows already fetched by the caller (no Directus call).
// Rows must include the flat multiselect fields: activities, awards, setting, style.
export function buildHotelFilterOptions(rows: any[]): HotelFilterOptions {
  return {
    affiliation: distinctSorted(rows.map((r) => r.affiliation)),
    region: distinctSorted(rows.map((r) => r.region)),
    country: distinctSorted(rows.map((r) => r.country)),
    state_province_county_island: distinctSorted(
      rows.map((r) => r.state_province_county_island)
    ),
    city: distinctSorted(rows.map((r) => r.city)),
    local_area: distinctSorted(rows.map((r) => r.local_area)),

    activities: distinctFromArrays(rows, "activities"),
    awards: distinctFromArrays(rows, "awards"),
    settings: distinctFromArrays(rows, "setting"),
    styles: distinctFromArrays(rows, "style"),
  };
}
