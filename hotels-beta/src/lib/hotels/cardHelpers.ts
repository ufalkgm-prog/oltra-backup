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
// Used for the selected-hotel detail panel's large image and the lightbox —
// both display much bigger than the card/popup contexts RATEHAWK_FULL_SIZE
// covers, so they need a sharper source.
export const RATEHAWK_LARGE_SIZE = "1920x1080";

export function resolveRatehawkUrl(url: string, size: string): string {
  return url.includes("{size}") ? url.replace("{size}", size) : url;
}

// Real photo(s) or nothing, no placeholder fallback.
//
// Supplier images uploaded to Directus take priority. The fetch layer attaches
// them as `directus_images`; a hotel carrying them ignores the ETG fields, so
// the two sources never interleave. Everything else falls back to ETG.
function getRawHotelImages(hotel: HotelRecord): { url: string; category: string | null }[] {
  const directusImages = hotel.directus_images ?? [];
  if (directusImages.length > 0) {
    return directusImages.map((image) => ({ url: image.url, category: null }));
  }

  if (hotel.ratehawk_image_1) {
    return [
      {
        url: resolveRatehawkUrl(hotel.ratehawk_image_1, RATEHAWK_FULL_SIZE),
        category: hotel.ratehawk_image_1_category ?? null,
      },
    ];
  }

  return [];
}

/**
 * The attribution a hotel's images require, or null when none is needed.
 * Supplier permissions are conditional on this being displayed.
 */
export function hotelImageCredit(hotel: HotelRecord): string | null {
  const credits = [
    ...new Set(
      (hotel.directus_images ?? [])
        .map((image) => image.credit)
        .filter((credit): credit is string => Boolean(credit))
    ),
  ];
  return credits.length > 0 ? credits.join(", ") : null;
}

export function hasRatehawkPhotos(hotel: HotelRecord): boolean {
  return Boolean(hotel.ratehawk_image_1);
}

export function hasDirectusPhotos(hotel: HotelRecord): boolean {
  return (hotel.directus_images ?? []).length > 0;
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
