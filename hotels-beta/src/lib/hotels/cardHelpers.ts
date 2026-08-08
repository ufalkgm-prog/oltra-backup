import type { HotelRecord } from "@/lib/directus";

export const HOTEL_CARD_PLACEHOLDERS = [
  "/images/hotel-placeholder-1.jpg",
  "/images/hotel-placeholder-2.jpg",
  "/images/hotel-placeholder-3.jpg",
  "/images/hotel-placeholder-4.jpg",
];

// Ratehawk image URLs carry an unresolved {size} template — see CLAUDE.md
// §27/§28 for the documented token whitelist.
export const RATEHAWK_THUMB_SIZE = "240x240";
export const RATEHAWK_FULL_SIZE = "1024x768";

export function resolveRatehawkUrl(url: string, size: string): string {
  return url.includes("{size}") ? url.replace("{size}", size) : url;
}

export function normalizeAgodaImage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.search = "";
    u.protocol = "https:";
    return u.toString();
  } catch {
    return url;
  }
}

export function hasAgodaPhotos(hotel: HotelRecord): boolean {
  return [
    hotel.agoda_photo1,
    hotel.agoda_photo2,
    hotel.agoda_photo3,
    hotel.agoda_photo4,
    hotel.agoda_photo5,
  ].some((value) => Boolean(value));
}

// Ratehawk-or-Agoda, no placeholder fallback — the "real photo(s) or nothing"
// list. Ratehawk takes priority when present; Agoda is only a fallback for
// hotels with no Ratehawk images (see CLAUDE.md §29).
function getRawHotelImages(hotel: HotelRecord): { url: string; category: string | null }[] {
  if (hotel.ratehawk_image_1) {
    return [
      {
        url: resolveRatehawkUrl(hotel.ratehawk_image_1, RATEHAWK_FULL_SIZE),
        category: hotel.ratehawk_image_1_category ?? null,
      },
    ];
  }

  const agodaImages = [
    hotel.agoda_photo1,
    hotel.agoda_photo2,
    hotel.agoda_photo3,
    hotel.agoda_photo4,
    hotel.agoda_photo5,
  ]
    .map((value) => normalizeAgodaImage(value))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index);

  return agodaImages.map((url) => ({ url, category: null }));
}

export function hasRatehawkPhotos(hotel: HotelRecord): boolean {
  return Boolean(hotel.ratehawk_image_1);
}

export function hasHotelPhotos(hotel: HotelRecord): boolean {
  return getRawHotelImages(hotel).length > 0;
}

export function getHotelThumbnail(hotel: HotelRecord): string | null {
  return getRawHotelImages(hotel)[0]?.url ?? null;
}

export function getHotelImageSet(hotel: HotelRecord): string[] {
  const images = getRawHotelImages(hotel).map((image) => image.url);
  if (images.length > 0) return images;
  return HOTEL_CARD_PLACEHOLDERS;
}

export function getHotelTotalPoints(hotel: HotelRecord): number {
  const extPoints = Number(hotel.ext_points ?? 0);
  const editorRank = Number(hotel.editor_rank ?? 0);
  const safeExtPoints = Number.isFinite(extPoints) ? extPoints : 0;
  const safeEditorRank = Number.isFinite(editorRank) ? editorRank : 0;
  return safeExtPoints + safeEditorRank * 3;
}

export function hotelAccoladeTier(hotel: HotelRecord): "gold" | "silver" | null {
  const totalPoints = getHotelTotalPoints(hotel);
  if (totalPoints > 25) return "gold";
  if (totalPoints >= 10) return "silver";
  return null;
}

export function clampHotelText(s: string | undefined | null, max = 160): string {
  if (!s) return "";
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + "…";
}
