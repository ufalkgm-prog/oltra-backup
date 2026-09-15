import { NextRequest, NextResponse } from "next/server";
import { getItemById } from "@/lib/directus";

// One published hotel's editorial description, for the Hotels page's selected
// hotel. Kept out of the bulk hotels fetch (2026-09-15): with every
// description in it that response was 2.8-3.7 MB, over the 2 MB Next.js data
// cache limit, so it was never cached and every navigation to /hotels
// re-downloaded the whole roster from Directus — measured at 11s.

type RawHotelDescription = { description?: string | null; published?: boolean | null };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Missing hotel id" }, { status: 400 });
  }

  try {
    const hotel = await getItemById<RawHotelDescription>("hotels", id, {
      fields: ["description", "published"],
    });
    if (hotel.published !== true) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, description: hotel.description ?? "" });
  } catch (error) {
    console.error("HOTEL DESCRIPTION ERROR:", error);
    return NextResponse.json(
      { ok: false, error: "Could not load the description." },
      { status: 500 }
    );
  }
}
