import { NextRequest, NextResponse } from "next/server";
import { getItemById } from "@/lib/directus";

// Lazy-loads the full ratehawk_image_1..50 / _category set for one hotel.
// Kept out of the bulk hotels fetch deliberately — see CLAUDE.md §29 for the
// payload-size reasoning (fetching all 100 fields for every hotel on the
// Hotels page would add ~4.5MB to every page load).
const IMAGE_COUNT = 50;

function buildFields(): string[] {
  const fields: string[] = [];
  for (let i = 1; i <= IMAGE_COUNT; i++) {
    fields.push(`ratehawk_image_${i}`, `ratehawk_image_${i}_category`);
  }
  return fields;
}

type RawHotelImageFields = Record<string, string | null | undefined>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing hotel id" }, { status: 400 });
  }

  try {
    const hotel = await getItemById<RawHotelImageFields>("hotels", id, {
      fields: buildFields(),
    });

    const images: { url: string; category: string | null }[] = [];
    for (let i = 1; i <= IMAGE_COUNT; i++) {
      const url = hotel[`ratehawk_image_${i}`];
      if (!url) break; // contiguous fill from 1, guaranteed by the backfill script
      images.push({ url, category: hotel[`ratehawk_image_${i}_category`] ?? null });
    }

    return NextResponse.json({ ok: true, images });
  } catch (error) {
    console.error("RATEHAWK IMAGES ERROR:", error);
    return NextResponse.json(
      { ok: false, error: "Could not load hotel images." },
      { status: 500 }
    );
  }
}
