import { getItems } from "@/lib/directus";

// Images uploaded to Directus and linked to a hotel through the hotel_images
// collection — one row per image, with the role and display order set at
// upload time. Supplier images live here; the ratehawk_image_* fields stay as
// they are and are used only when a hotel has no rows in this collection.
//
// The files sit in the Directus S3 bucket and are served from /assets/{id}.
// directus_files.credit carries the attribution the supplier's permission
// requires, and it must be displayed wherever the image is shown.

export type HotelImageRole = "hero" | "secondary" | "gallery";

export type HotelImage = {
  url: string;
  credit: string | null;
  role: HotelImageRole;
  width: number | null;
  height: number | null;
};

type HotelImageRow = {
  role: string | null;
  sort: number | null;
  hotel: { id: string | number } | string | number | null;
  file: {
    id: string;
    credit: string | null;
    width: number | null;
    height: number | null;
  } | null;
};

const FIELDS = ["role", "sort", "hotel.id", "file.id", "file.credit", "file.width", "file.height"];

function assetBase(): string | null {
  const base = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
  return base ?? null;
}

/**
 * Browser-facing URL for a Directus file.
 *
 * Routed through this app rather than pointing at Directus directly: assets
 * there are not publicly readable, and the browser carries no token. See
 * src/app/api/hotel-images/file/[fileId]/route.ts.
 */
export function directusAssetUrl(fileId: string, width?: number): string {
  const path = `/api/hotel-images/file/${fileId}`;
  return width ? `${path}?width=${width}&fit=cover` : path;
}

function hotelIdOf(row: HotelImageRow): string | null {
  const value = row.hotel;
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return String(value.id);
  return String(value);
}

function toImage(row: HotelImageRow): HotelImage | null {
  if (!row.file?.id) return null;
  const role = row.role === "hero" || row.role === "secondary" ? row.role : "gallery";
  return {
    url: directusAssetUrl(row.file.id),
    credit: row.file.credit ?? null,
    role,
    width: row.file.width ?? null,
    height: row.file.height ?? null,
  };
}

/**
 * Images for the given hotels, keyed by hotel id and ordered hero, secondary,
 * then gallery by the sort set at upload. Hotels with no rows are absent from
 * the map rather than present with an empty array.
 */
export async function getHotelImagesByHotelIds(
  hotelIds: (string | number)[]
): Promise<Map<string, HotelImage[]>> {
  const byHotel = new Map<string, HotelImage[]>();
  const ids = [...new Set(hotelIds.map((id) => String(id)))].filter(Boolean);
  if (ids.length === 0 || !assetBase()) return byHotel;

  const rows = await getItems<HotelImageRow>("hotel_images", {
    fields: FIELDS,
    filter: { hotel: { _in: ids } },
    // One row per image; a hotel carries a few dozen at most.
    limit: -1,
    sort: ["sort"],
  });

  const rank: Record<HotelImageRole, number> = { hero: 0, secondary: 1, gallery: 2 };
  for (const row of rows) {
    const hotelId = hotelIdOf(row);
    const image = toImage(row);
    if (!hotelId || !image) continue;
    const list = byHotel.get(hotelId);
    if (list) list.push(image);
    else byHotel.set(hotelId, [image]);
  }
  for (const list of byHotel.values()) list.sort((a, b) => rank[a.role] - rank[b.role]);

  return byHotel;
}

/** Images for a single hotel, in display order. */
export async function getHotelImages(hotelId: string | number): Promise<HotelImage[]> {
  return (await getHotelImagesByHotelIds([hotelId])).get(String(hotelId)) ?? [];
}

/** The distinct credits in a set of images, for a "Photo: …" line. */
export function imageCredits(images: HotelImage[]): string[] {
  return [...new Set(images.map((image) => image.credit).filter((c): c is string => Boolean(c)))];
}
