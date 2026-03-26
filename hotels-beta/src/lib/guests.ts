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