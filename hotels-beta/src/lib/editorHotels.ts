// src/lib/editorHotels.ts
import { directusFetchJson, getItemById, getItems } from "@/lib/directus";

export type RelationOption = {
  id: string;
  name: string;
};

export type EditorHotel = {
  id: string;
  hotel_name?: string | null;
  www?: string | null;
  insta?: string | null;

  region?: string | null;
  country?: string | null;
  state_province_county_island?: string | null;
  city?: string | null;
  local_area?: string | null;

  highlights?: string | null;
  description?: string | null;

  ext_points?: number | string | null;
  editor_rank?: number | string | null;
  total_rooms_suites_villas?: number | string | null;

  published?: boolean | null;

  activities?: string[] | null;
  awards?: string[] | null;
  setting?: string[] | null;
  style?: string[] | null;
};

const COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

export async function searchEditorHotels(query?: string) {
  const q = (query || "").trim();

  const filter = q
    ? {
        _or: [
          { hotel_name: { _icontains: q } },
          { city: { _icontains: q } },
          { country: { _icontains: q } },
          { local_area: { _icontains: q } },
        ],
      }
    : undefined;

  return getItems<EditorHotel>(COLLECTION, {
    fields: ["id", "hotel_name", "city", "country", "published"],
    sort: "id",
    limit: 50,
    filter,
  });
}

export async function getEditorHotelById(id: string) {
  return getItemById<EditorHotel>(COLLECTION, id, {
    fields: [
      "id",
      "hotel_name",
      "www",
      "insta",
      "region",
      "country",
      "state_province_county_island",
      "city",
      "local_area",
      "highlights",
      "description",
      "ext_points",
      "editor_rank",
      "total_rooms_suites_villas",
      "published",
      "activities",
      "awards",
      "setting",
      "style",
    ],
  });
}

export async function getPrevNextHotelIds(id: string) {
  const numericId = Number(id);

  const prev = await getItems<{ id: string | number }>(COLLECTION, {
    fields: ["id"],
    filter: { id: { _lt: numericId } },
    sort: "-id",
    limit: 1,
  });

  const next = await getItems<{ id: string | number }>(COLLECTION, {
    fields: ["id"],
    filter: { id: { _gt: numericId } },
    sort: "id",
    limit: 1,
  });

  return {
    prevId: prev?.[0]?.id?.toString() || null,
    nextId: next?.[0]?.id?.toString() || null,
  };
}

type DirectusFieldChoicesResponse = {
  meta?: {
    options?: {
      choices?: Array<{ text: string; value: string }>;
    } | null;
  } | null;
};

// activities/awards/setting/style are flat multiselect tag fields on hotels —
// the allowed values live in the field's own meta.options.choices, not in a
// separate relational collection.
async function getTaxonomyChoices(field: string): Promise<RelationOption[]> {
  const data = await directusFetchJson<DirectusFieldChoicesResponse>(
    `/fields/${COLLECTION}/${field}`
  );
  const choices = data?.meta?.options?.choices ?? [];
  return choices.map((c) => ({ id: c.value, name: c.text }));
}

export async function getEditorTaxonomies() {
  const [activities, awards, setting, style] = await Promise.all([
    getTaxonomyChoices("activities"),
    getTaxonomyChoices("awards"),
    getTaxonomyChoices("setting"),
    getTaxonomyChoices("style"),
  ]);

  return { activities, awards, setting, style };
}
