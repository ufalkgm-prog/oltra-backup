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

/* Members > Saved trips draws each hotel with the landing page's card
 * (HotelSmallCard), which also needs its photo and who sells it. Small
 * per-row fields only - never ratehawk_room_groups (see HotelRecord). */
const CARD_FIELDS = [
  "ratehawk_image_1",
  "ratehawk_image_1_category",
  "ratehawk_hid",
  "ratehawk_status",
  "booking_partner",
  "booking_provider",
  "booking_URL",
  "booking_hotel_ref",
  "booking_enabled",
  "www",
  // The itinerary's address, phone and check-in lines (2026-10-06).
  "ratehawk_address",
  "ratehawk_phone",
  "ratehawk_check_in_time",
  "ratehawk_check_out_time",
];

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
    /* By name, for the rows that have no real id: the seeded demo favourites
       and trip items carry placeholder ids, so without this they never found
       their hotel and drew "Photos coming soon". Published hotels only. */
    const names = Array.isArray(body.names)
      ? body.names
          .map((name) => String(name).trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];

    if (!ids.length && !names.length) return NextResponse.json({ ok: true, hotels: [] });

    const byId = ids.length ? [{ id: { _in: ids } }] : [];
    const byName = names.length
      ? [{ _and: [{ hotel_name: { _in: names } }, { published: { _eq: true } }] }]
      : [];

    const hotels = await getItems<HotelSummaryRow>("hotels", {
      fields: ["id", "hotel_name", "highlights", "city", "country", "affiliation", ...CARD_FIELDS],
      filter: { _or: [...byId, ...byName] },
      limit: -1,
    });

    return NextResponse.json({ ok: true, hotels });
  } catch {
    return NextResponse.json({ ok: false, hotels: [] }, { status: 500 });
  }
}
