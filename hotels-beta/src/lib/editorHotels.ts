// src/lib/editorHotels.ts
import { getItemById, getItems } from "@/lib/directus";

export type RelationOption = {
  id: string;
  name: string;
  slug?: string | null;
};

type ActivityJoin = {
  id?: string | number;
  activities_id?: {
    id?: string | number;
    name?: string | null;
    slug?: string | null;
  } | null;
};

type AwardJoin = {
  id?: string | number;
  awards_id?: {
    id?: string | number;
    name?: string | null;
    code?: string | null;
  } | null;
};

type SettingJoin = {
  id?: string | number;
  settings_id?: {
    id?: string | number;
    name?: string | null;
    slug?: string | null;
  } | null;
};

type StyleJoin = {
  id?: string | number;
  styles_id?: {
    id?: string | number;
    name?: string | null;
    slug?: string | null;
  } | null;
};

export type EditorHotel = {
  id: string;
  hotel_name?: string | null;
  www?: string | null;
  insta?: string | null;

  region?: string | null;
  country?: string | null;
  state_province__county__island?: string | null;
  city?: string | null;
  local_area?: string | null;

  highlights?: string | null;
  description?: string | null;
  high_season?: string | null;
  low_season?: string | null;
  rain_season?: string | null;

  ext_points?: number | string | null;
  editor_rank_13?: number | string | null;
  total_rooms_suites_villas?: number | string | null;
  rooms_suites?: number | string | null;
  villas?: number | string | null;

  published?: boolean | null;

  activities?: ActivityJoin[] | null;
  awards?: AwardJoin[] | null;
  settings?: SettingJoin[] | null;
  styles?: StyleJoin[] | null;

  selectedActivityIds?: string[];
  selectedAwardIds?: string[];
  selectedSettingIds?: string[];
  selectedStyleIds?: string[];
};

const COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

function extractNestedIds<T extends { id?: string | number }>(
  items: Array<{ [key: string]: T | null | undefined }> | null | undefined,
  key: string
): string[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const nested = item?.[key] as T | null | undefined;
      if (!nested?.id) return null;
      return String(nested.id);
    })
    .filter((value): value is string => Boolean(value));
}

function normalizeHotelRelations(hotel: EditorHotel): EditorHotel {
  return {
    ...hotel,
    selectedActivityIds: extractNestedIds(hotel.activities as any, "activities_id"),
    selectedAwardIds: extractNestedIds(hotel.awards as any, "awards_id"),
    selectedSettingIds: extractNestedIds(hotel.settings as any, "settings_id"),
    selectedStyleIds: extractNestedIds(hotel.styles as any, "styles_id"),
  };
}

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
  const hotel = await getItemById<EditorHotel>(COLLECTION, id, {
    fields: [
      "id",
      "hotel_name",
      "www",
      "insta",
      "region",
      "country",
      "state_province__county__island",
      "city",
      "local_area",
      "highlights",
      "description",
      "high_season",
      "low_season",
      "rain_season",
      "ext_points",
      "editor_rank_13",
      "total_rooms_suites_villas",
      "rooms_suites",
      "villas",
      "published",

      "activities.id",
      "activities.activities_id.id",
      "activities.activities_id.name",
      "activities.activities_id.slug",

      "awards.id",
      "awards.awards_id.id",
      "awards.awards_id.name",
      "awards.awards_id.code",

      "settings.id",
      "settings.settings_id.id",
      "settings.settings_id.name",
      "settings.settings_id.slug",

      "styles.id",
      "styles.styles_id.id",
      "styles.styles_id.name",
      "styles.styles_id.slug",
    ],
  });

  return normalizeHotelRelations(hotel);
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

export async function getRelationOptions(
  collection: "activities" | "awards" | "settings" | "styles"
) {
  if (collection === "awards") {
    const res = await getItems<{
      id: string | number;
      name?: string | null;
      code?: string | null;
    }>("awards", {
      fields: ["id", "name", "code"],
      limit: 500,
      sort: "name",
    });

    return res.map((item) => ({
      id: String(item.id),
      name: item.name || item.code || String(item.id),
      slug: null,
    }));
  }

  const res = await getItems<{
    id: string | number;
    name?: string | null;
    slug?: string | null;
  }>(collection, {
    fields: ["id", "name", "slug"],
    limit: 500,
    sort: "name",
  });

  return res.map((item) => ({
    id: String(item.id),
    name: item.name || String(item.id),
    slug: item.slug ?? null,
  }));
}

export async function getEditorTaxonomies() {
  const [activities, awards, settings, styles] = await Promise.all([
    getRelationOptions("activities"),
    getRelationOptions("awards"),
    getRelationOptions("settings"),
    getRelationOptions("styles"),
  ]);

  return { activities, awards, settings, styles };
}