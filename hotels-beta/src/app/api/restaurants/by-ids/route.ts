import { NextResponse } from "next/server";
import { getRestaurantsByIds, getRestaurantsByNames } from "@/lib/restaurants";

/* Members > Favorite restaurants needs the full editorial record for a set of
 * favourites, but the ids only exist client-side (they come from the member's
 * own RLS-scoped Supabase rows), so the lookup cannot happen in a server
 * component. Read-only, published records only - same data the Restaurants
 * page already serves publicly. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown; names?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids
          .map((id) => String(id).trim())
          // Digits only: these are bigint primary keys, and Directus rejects
          // the whole _in filter if any value cannot be cast - so one junk id
          // (seeded demo rows carry placeholder ids) would fail the lookup for
          // every real record in the same batch.
          .filter((id) => /^\d+$/.test(id))
          .slice(0, 200)
      : [];
    /* By name, for the rows that have no real id (the seeded demo
       favourites). */
    const names = Array.isArray(body.names)
      ? body.names
          .map((name) => String(name).trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];

    if (!ids.length && !names.length) {
      return NextResponse.json({ ok: true, restaurants: [] });
    }

    const [byId, byName] = await Promise.all([
      getRestaurantsByIds(ids),
      getRestaurantsByNames(names),
    ]);
    const seen = new Set(byId.map((r) => String(r.id)));
    const restaurants = [...byId, ...byName.filter((r) => !seen.has(String(r.id)))];
    return NextResponse.json({ ok: true, restaurants });
  } catch {
    return NextResponse.json(
      { ok: false, restaurants: [] },
      { status: 500 }
    );
  }
}
