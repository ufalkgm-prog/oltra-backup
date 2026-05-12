import type { HotelRecord } from "@/lib/directus";

export const HOTEL_CARD_PLACEHOLDERS = [
  "/images/hotel-placeholder-1.jpg",
  "/images/hotel-placeholder-2.jpg",
  "/images/hotel-placeholder-3.jpg",
  "/images/hotel-placeholder-4.jpg",
];

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

export function getHotelImageSet(hotel: HotelRecord): string[] {
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

  if (agodaImages.length > 0) return agodaImages;
  return HOTEL_CARD_PLACEHOLDERS;
}

export function getHotelTotalPoints(hotel: HotelRecord): number {
  const extPoints = Number(hotel.ext_points ?? 0);
  const editorRank = Number(hotel.editor_rank_13 ?? 0);
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
