import { NextResponse } from "next/server";
import { getItems } from "@/lib/directus";
import type { AiHotelCard } from "@/lib/ai/types";

/* Card data for the AI results region.
 *
 * Its own route rather than widening /api/hotels/by-ids: that one serves the
 * Members area, returns six editorial fields, and nothing about this feature
 * should be able to change what Favourites renders. Same shape of guard
 * though — digits-only ids, because Directus rejects the entire `_in` filter
 * if any value cannot be cast to bigint, so one bad id would fail the lookup
 * for every good one in the batch (CLAUDE.md §46).
 *
 * Order is preserved from the request: the model ranked these, and that
 * ranking is the answer. */

const CARD_FIELDS = [
  "id",
  "hotel_name",
  "city",
  "country",
  "affiliation",
  "highlights",
  "ratehawk_hid",
  "ratehawk_status",
  "ratehawk_image_1",
  "agoda_photo1",
  "agoda_photo2",
  "agoda_photo3",
  "agoda_photo4",
  "agoda_photo5",
  "www",
  "booking_provider",
  "booking_URL",
  "booking_enabled",
  "booking_hotel_ref",
];

const MAX_IDS = 40;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    const requested = Array.isArray(body.ids)
      ? body.ids
          .map((id) => String(id).trim())
          .filter((id) => /^\d+$/.test(id))
          .slice(0, MAX_IDS)
      : [];

    if (!requested.length) return NextResponse.json({ ok: true, hotels: [] });

    const rows = await getItems<AiHotelCard>("hotels", {
      fields: CARD_FIELDS,
      filter: { _and: [{ id: { _in: requested } }, { published: { _eq: true } }] },
      limit: -1,
    });

    const byId = new Map(rows.map((row) => [String(row.id), row]));
    const ordered = requested
      .map((id) => byId.get(id))
      .filter((row): row is AiHotelCard => Boolean(row));

    return NextResponse.json({ ok: true, hotels: ordered });
  } catch (err) {
    console.error("[ai hotels]", err);
    return NextResponse.json({ ok: false, hotels: [] }, { status: 500 });
  }
}
