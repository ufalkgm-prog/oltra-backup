type PageSearchParams = Record<string, string | string[] | undefined>;

export type GuestSelection = {
  adults: number;
  kids: number;
  kidAges: string[];
};

export function normalizeParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

export function clampAdultsCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.round(value)));
}

export function clampKidsCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(6, Math.round(value)));
}

// ETG's documented occupancy limit per room (§32). The party is spread across
// the rooms round-robin (buildGuestsArray), so the busiest room holds
// ceil(n / rooms) — which fits exactly when n <= limit × rooms.
/** The bedrooms selector offers 1-4, and a value outside that used to reach
 * it unclamped: `?bedrooms=99` left OltraSelect with nothing to match, so it
 * fell back to its placeholder and the field read "#" (Ulrik, 2026-09-21).
 * Adults and children were already clamped on the way in; this is the same. */
export const MAX_BEDROOMS = 4;

export function clampBedrooms(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_BEDROOMS, Math.floor(n)));
}

export const MAX_ADULTS_PER_ROOM = 6;
export const MAX_CHILDREN_PER_ROOM = 4;

export function maxAdultsFor(rooms: number): number {
  return Math.min(8, MAX_ADULTS_PER_ROOM * Math.max(1, Math.floor(rooms)));
}

export function maxKidsFor(rooms: number): number {
  return Math.min(6, MAX_CHILDREN_PER_ROOM * Math.max(1, Math.floor(rooms)));
}

export const OCCUPANCY_LIMIT_MESSAGE =
  "Up to 6 adults and 4 children per room — add a room for more guests.";

export const CHILD_AGE_MISSING_MESSAGE = "Add each child's age to see prices.";

function isChildAge(value: string | undefined): boolean {
  if (value == null || value.trim() === "") return false;
  const age = Number(value);
  return Number.isInteger(age) && age >= 0 && age <= 17;
}

/* Why a guest selection cannot be priced yet, or null when it can. A missing
 * child age is never defaulted — a wrong age means a wrong price and a problem
 * at check-in. Rooms is optional so callers without a room count (Flights)
 * only get the age check. */
export function guestSelectionIssue(
  selection: GuestSelection,
  rooms?: number
): string | null {
  for (let i = 0; i < selection.kids; i++) {
    if (!isChildAge(selection.kidAges[i])) return CHILD_AGE_MISSING_MESSAGE;
  }
  if (
    rooms != null &&
    (selection.adults > maxAdultsFor(rooms) || selection.kids > maxKidsFor(rooms))
  ) {
    return OCCUPANCY_LIMIT_MESSAGE;
  }
  return null;
}

export function getKidAgeValues(
  searchParams: PageSearchParams,
  kidsCount: number
): string[] {
  return Array.from({ length: kidsCount }, (_, i) =>
    normalizeParam(searchParams[`kid_age_${i + 1}`])
  );
}

export function readGuestSelection(
  searchParams: PageSearchParams
): GuestSelection {
  const adults = clampAdultsCount(
    Number(normalizeParam(searchParams.adults) || "2") || 2
  );
  const kids = clampKidsCount(
    Number(normalizeParam(searchParams.kids) || "0") || 0
  );

  return {
    adults,
    kids,
    kidAges: getKidAgeValues(searchParams, kids),
  };
}

export function buildGuestSummaryLabel(selection: GuestSelection): string {
  const adultsLabel = `${selection.adults} adult${
    selection.adults === 1 ? "" : "s"
  }`;

  if (selection.kids <= 0) return adultsLabel;

  const kidsLabel = `${selection.kids} child${
    selection.kids === 1 ? "" : "ren"
  }`;

  return `${adultsLabel}, ${kidsLabel}`;
}