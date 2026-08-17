import { NextResponse } from "next/server";
import { getRestaurantsByIds } from "@/lib/restaurants";

/* Members > Favorite restaurants needs the full editorial record for a set of
 * favourites, but the ids only exist client-side (they come from the member's
 * own RLS-scoped Supabase rows), so the lookup cannot happen in a server
 * component. Read-only, published records only - same data the Restaurants
 * page already serves publicly. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id) => String(id)).filter(Boolean).slice(0, 200)
      : [];

    if (!ids.length) return NextResponse.json({ ok: true, restaurants: [] });

    const restaurants = await getRestaurantsByIds(ids);
    return NextResponse.json({ ok: true, restaurants });
  } catch {
    return NextResponse.json(
      { ok: false, restaurants: [] },
      { status: 500 }
    );
  }
}
