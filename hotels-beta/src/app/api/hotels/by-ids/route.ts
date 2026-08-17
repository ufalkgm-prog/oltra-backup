import { NextResponse } from "next/server";
import { getItems } from "@/lib/directus";

/* Editorial fields for a set of hotels, by Directus id.
 *
 * Members > Favorite hotels stores only a name, a location label and one
 * thumbnail, so the highlights line has to be read live. Doing it this way
 * rather than adding a column also means the text stays current when an editor
 * revises it, instead of freezing whatever was true the day it was saved.
 * Same shape as /api/restaurants/by-ids. */

type HotelSummaryRow = {
  id: string | number;
  hotel_name: string | null;
  highlights: string | null;
  city: string | null;
  country: string | null;
  affiliation: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
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

    if (!ids.length) return NextResponse.json({ ok: true, hotels: [] });

    const hotels = await getItems<HotelSummaryRow>("hotels", {
      fields: ["id", "hotel_name", "highlights", "city", "country", "affiliation"],
      filter: { id: { _in: ids } },
      limit: -1,
    });

    return NextResponse.json({ ok: true, hotels });
  } catch {
    return NextResponse.json({ ok: false, hotels: [] }, { status: 500 });
  }
}
