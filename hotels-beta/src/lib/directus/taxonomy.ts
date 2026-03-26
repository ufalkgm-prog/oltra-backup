// src/lib/directus/taxonomy.ts
import { directusFetch } from "@/lib/directus/fetch";

type DirectusListResponse<T> = { data: T[] };

type TaxItem = {
  id: number | string;
  name: string;
};

export async function fetchTaxonomyMap(collection: string) {
  const res = await directusFetch<DirectusListResponse<TaxItem>>(`/items/${collection}`, {
    params: { fields: "id,name", limit: "500" },
    revalidate: 3600,
    public: true, // use Public role; don't attach token
  });

  const map = new Map<string, string>();
  for (const item of res.data) map.set(String(item.id), item.name);
  return map;
}

export async function fetchAllHotelTaxonomies() {
  const [activities, awards, settings, styles] = await Promise.all([
    fetchTaxonomyMap("activities"),
    fetchTaxonomyMap("awards"),
    fetchTaxonomyMap("settings"),
    fetchTaxonomyMap("styles"),
  ]);

  return { activities, awards, settings, styles };
}