// src/lib/hotelOptions.ts
import "server-only";

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

// Extracts taxonomy IDs from nested M2M relation format:
// rows[n].activities = [{ activities_id: { id, name } }, ...]
function collectNestedIds(rows: any[], key: string, nestedKey: string): string[] {
  const all: Array<string | number> = [];
  for (const r of rows) {
    const v = r?.[key];
    if (!Array.isArray(v)) continue;
    for (const item of v) {
      const id = item?.[nestedKey]?.id;
      if (id != null) all.push(id);
    }
  }
  return distinctIds(all);
}

function toIdOptions(ids: string[]): RelOption[] {
  return sortRelOptions(ids.map((id) => ({ id, label: id })));
}

// Sync builder — accepts rows already fetched by the caller (no Directus call).
// Rows must include the nested M2M fields:
//   activities.activities_id.id, awards.awards_id.id,
//   settings.settings_id.id, styles.styles_id.id
export function buildHotelFilterOptions(rows: any[]): HotelFilterOptions {
  return {
    affiliation: distinctSorted(rows.map((r) => r.affiliation)),
    region: distinctSorted(rows.map((r) => r.region)),
    country: distinctSorted(rows.map((r) => r.country)),
    state_province__county__island: distinctSorted(
      rows.map((r) => r.state_province__county__island)
    ),
    city: distinctSorted(rows.map((r) => r.city)),
    local_area: distinctSorted(rows.map((r) => r.local_area)),

    activities: toIdOptions(collectNestedIds(rows, "activities", "activities_id")),
    awards: toIdOptions(collectNestedIds(rows, "awards", "awards_id")),
    settings: toIdOptions(collectNestedIds(rows, "settings", "settings_id")),
    styles: toIdOptions(collectNestedIds(rows, "styles", "styles_id")),
  };
}
