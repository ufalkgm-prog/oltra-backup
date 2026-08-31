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
  saveHotelFlightSearch({
    ...current,
    ...clean(values),
  });
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