// src/lib/hotelOptions.ts
import "server-only";
import { getHotels } from "@/lib/directus";

/**
 * Minimal “options” provider for filters:
 * - Pulls distinct values for key scalar fields from published hotels.
 * - For relational fields (activities/settings/styles/awards), returns ID-based options.
 *
 * Note: Your Directus API currently returns relations as arrays of IDs
 * (e.g. "activities":[1159]), so options are derived from those IDs.
 * We can later upgrade labels by fetching taxonomy collections once we expose
 * a generic Directus fetch helper from src/lib/directus.ts.
 */

export type RelOption = { id: string; label: string };

export type HotelFilterOptions = {
  affiliation: string[];
  region: string[];
  country: string[];
  state_province__county__island: string[];
  city: string[];
  local_area: string[];

  activities: RelOption[];
  awards: RelOption[];
  settings: RelOption[];
  styles: RelOption[];
};

function distinctSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function distinctIds(values: Array<string | number | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) set.add(s);
  }
  return Array.from(set);
}

function sortRelOptions(opts: RelOption[]): RelOption[] {
  return opts.slice().sort((a, b) => a.label.localeCompare(b.label));
}

export async function getHotelFilterOptions(): Promise<HotelFilterOptions> {
  const rows = await getHotels({
    fields: [
      "affiliation",
      "region",
      "country",
      "state_province__county__island",
      "city",
      "local_area",
      "published",

      // relations (currently returned as arrays of IDs)
      "activities",
      "awards",
      "settings",
      "styles",
    ],
    filter: { published: { _eq: true } },
    limit: 5000, // tune later
    sort: ["country", "city", "hotel_name"],
  });

  const collectRelIds = (
    key: "activities" | "awards" | "settings" | "styles"
  ): string[] => {
    const all: Array<string | number> = [];
    for (const r of rows as any[]) {
      const v = r?.[key];
      if (Array.isArray(v)) {
        for (const id of v) {
          if (id !== null && id !== undefined) all.push(id);
        }
      }
    }
    return distinctIds(all);
  };

  const toIdOptions = (ids: string[]): RelOption[] =>
    sortRelOptions(ids.map((id) => ({ id, label: id })));

  const activities = toIdOptions(collectRelIds("activities"));
  const awards = toIdOptions(collectRelIds("awards"));
  const settings = toIdOptions(collectRelIds("settings"));
  const styles = toIdOptions(collectRelIds("styles"));

  return {
    affiliation: distinctSorted(rows.map((r: any) => r.affiliation)),
    region: distinctSorted(rows.map((r: any) => r.region)),
    country: distinctSorted(rows.map((r: any) => r.country)),
    state_province__county__island: distinctSorted(
      rows.map((r: any) => r.state_province__county__island)
    ),
    city: distinctSorted(rows.map((r: any) => r.city)),
    local_area: distinctSorted(rows.map((r: any) => r.local_area)),

    activities,
    awards,
    settings,
    styles,
  };
}