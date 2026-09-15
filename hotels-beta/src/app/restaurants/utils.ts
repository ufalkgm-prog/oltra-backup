// src/app/restaurants/utils.ts
import type { RestaurantRecord } from "./types";

const AWARD_LABELS: Record<string, string> = {
  worlds_50: "World's 50 Best Restaurants",
  michelin_3: "Michelin 3 stars",
  michelin_2: "Michelin 2 stars",
  michelin_1: "Michelin 1 star",
  bib_gourmand: "Bib Gourmand",
  laliste100: "La Liste Top 100",
};

/** A restaurant's Michelin standing in words, or "" when it has none. Ulrik
 * (2026-09-15): the stars are always said, and "Not Michelin" never — it is
 * implied by their absence. */
export function michelinStatus(r: Pick<RestaurantRecord, "awards">): string {
  const awards = new Set(r.awards ?? []);
  if (awards.has("michelin_3")) return "Michelin 3 stars";
  if (awards.has("michelin_2")) return "Michelin 2 stars";
  if (awards.has("michelin_1")) return "Michelin 1 star";
  if (awards.has("bib_gourmand")) return "Michelin Bib Gourmand";
  return "";
}

export function hasValidCoords(r: RestaurantRecord) {
  if (r.lat === null || r.lng === null) return false;
  if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) return false;
  if (r.lat < -90 || r.lat > 90) return false;
  if (r.lng < -180 || r.lng > 180) return false;
  return true;
}

export function buildLocationLabel(r: RestaurantRecord) {
  return [
    r.local_area,
    r.city,
    r.region,
    r.country,
  ].filter(Boolean).join(" · ");
}

export function buildAddressLabel(r: RestaurantRecord) {
  return [
    r.local_area,
    r.state_province_county_island,
    r.city,
    r.country,
  ].filter(Boolean).join(", ");
}

export function buildAwardsLabel(r: RestaurantRecord) {
  return (r.awards ?? [])
    .map((code) => AWARD_LABELS[code] ?? code)
    .join(" · ");
}