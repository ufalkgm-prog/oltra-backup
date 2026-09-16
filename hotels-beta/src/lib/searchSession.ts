export type SharedTravelSearch = {
  q?: string;
  city?: string;
  /** Directus `state_province_county_island` — Hotels-page only; the Flights
   * page has no equivalent field and simply carries it through untouched. */
  state?: string;
  /** Directus `admin_region` — same Hotels-only treatment as `state`. */
  admin_region?: string;
  country?: string;
  region?: string;
  /** A colloquial region from the destination field ("The Alps") — same
   * Hotels-only treatment as `state`. */
  macro_region?: string;
  from?: string;
  to?: string;
  adults?: string;
  kids?: string;
  bedrooms?: string;
  origin?: string;
  hotelId?: string;
  kid_age_1?: string;
  kid_age_2?: string;
  kid_age_3?: string;
  kid_age_4?: string;
  kid_age_5?: string;
  kid_age_6?: string;
};

const HOTEL_FLIGHT_KEY = "oltra_hotel_flight_search";

function clean(values: SharedTravelSearch): SharedTravelSearch {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== "")
  ) as SharedTravelSearch;
}

export function saveHotelFlightSearch(values: SharedTravelSearch) {
  if (typeof window === "undefined") return;

  const next = clean(values);
  window.sessionStorage.setItem(HOTEL_FLIGHT_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("oltra:hotel-flight-search-change"));
}

export function mergeHotelFlightSearch(values: SharedTravelSearch) {
  if (typeof window === "undefined") return;

  const current = readHotelFlightSearch() ?? {};
  // A different child count, or a new set of ages, replaces the ages
  // wholesale: the merge drops empty values, so an age from an earlier party
  // would otherwise outlive it. Only then — the Flights page saves the count
  // without ages on every change, and must not wipe ages it never held.
  const writesAges = KID_AGE_KEYS.some((key) => values[key] !== undefined);
  if (writesAges || (values.kids !== undefined && values.kids !== current.kids)) {
    for (const key of KID_AGE_KEYS) delete current[key];
  }
  saveHotelFlightSearch({
    ...current,
    ...clean(values),
  });
}

const KID_AGE_KEYS = ["kid_age_1", "kid_age_2", "kid_age_3", "kid_age_4", "kid_age_5", "kid_age_6"] as const;

/** Children's ages as the session's kid_age_N fields. */
export function kidAgeFields(ages: (string | number)[]): SharedTravelSearch {
  const fields: SharedTravelSearch = {};
  ages.slice(0, KID_AGE_KEYS.length).forEach((age, index) => {
    const value = String(age ?? "").trim();
    if (value) fields[KID_AGE_KEYS[index]] = value;
  });
  return fields;
}

/** Drops the destination from the shared search, keeping the stay (dates,
 * guests, origin). For when the visitor dismisses the concierge's curated
 * results: the concierge mirrors its destination in here, and the Hotels page
 * restores a bare URL from it — so without this, clearing "AI curated results"
 * brought the answer's city straight back as a tag search. */
export function clearHotelFlightDestination() {
  const current = readHotelFlightSearch();
  if (!current) return;
  const stay: SharedTravelSearch = { ...current };
  for (const key of ["q", "city", "state", "admin_region", "country", "region", "macro_region", "hotelId"] as const) {
    delete stay[key];
  }
  saveHotelFlightSearch(stay);
}

/** Removes the dates, but only if they are still the ones given — so Clear in
 * the concierge takes back dates it set and never dates picked since. */
export function clearHotelFlightDatesIf(from: string, to: string) {
  const current = readHotelFlightSearch();
  if (!current || (current.from ?? "") !== from || (current.to ?? "") !== to) return;
  const next: SharedTravelSearch = { ...current };
  delete next.from;
  delete next.to;
  saveHotelFlightSearch(next);
}

export function readHotelFlightSearch(): SharedTravelSearch | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(HOTEL_FLIGHT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}