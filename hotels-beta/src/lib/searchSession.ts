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
  /* The destination field's tags (Landing and Hotels) and the Hotels page's
   * own filters, so the latest search carries all of it (2026-09-28). */
  activities?: string;
  settings?: string;
  styles?: string;
  awards?: string;
  affiliation?: string;
  local_area?: string;
  min_price?: string;
  max_price?: string;
  /** When it was written (ms). Lets a page with its own copy — Flights —
   * tell whether the shared search is newer than what it remembers. */
  savedAt?: number;
};

const HOTEL_FLIGHT_KEY = "oltra_hotel_flight_search";

function clean(values: SharedTravelSearch): SharedTravelSearch {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== "")
  ) as SharedTravelSearch;
}

/* The fields that make a search an entry, as opposed to the party or the
   departure airport, which every page fills with a default. */
const ENTRY_KEYS = [
  "q",
  "city",
  "state",
  "admin_region",
  "country",
  "region",
  "macro_region",
  "activities",
  "settings",
  "from",
  "to",
] as const;

export function saveHotelFlightSearch(values: SharedTravelSearch) {
  if (typeof window === "undefined") return;

  const next = { ...clean(values), savedAt: Date.now() };
  window.sessionStorage.setItem(HOTEL_FLIGHT_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("oltra:hotel-flight-search-change"));
}

/* THE LATEST ENTRY WINS, WHOLE (Ulrik, 2026-09-28).
 *
 * A page calls this with everything its search holds — destination, tags,
 * dates, party and, on Hotels, its filters. If that is what is already saved,
 * nothing happens: arriving on a page, or passing through one that cannot show
 * some of the saved fields (the landing page has no accolade filter), is not a
 * new entry and must not rewrite the search. If anything differs, the page's
 * set REPLACES the saved one, so nothing from an earlier search lingers.
 *
 * Kept across a replace: the departure airport (a standing preference, not
 * part of an entry — it is not compared either, or the landing page's own
 * home-airport fill would read as an entry), and the selected hotel while the
 * city is unchanged. The concierge and small updates still use the merge
 * below. */
export function recordSearchEntry(values: SharedTravelSearch) {
  if (typeof window === "undefined") return;

  const current = readHotelFlightSearch() ?? {};
  const DEFAULTS: Partial<Record<keyof SharedTravelSearch, string>> = {
    adults: "2",
    kids: "0",
    bedrooms: "1",
  };
  const norm = (key: keyof SharedTravelSearch, value: string | number | undefined) =>
    String(value ?? "").trim() || DEFAULTS[key] || "";

  const keys = new Set([
    ...(Object.keys(values) as (keyof SharedTravelSearch)[]),
    ...(Object.keys(current) as (keyof SharedTravelSearch)[]),
  ]);
  keys.delete("origin");
  keys.delete("hotelId");
  keys.delete("savedAt");
  const unchanged = [...keys].every((key) => {
    // A field this page does not have cannot differ on it.
    if (!(key in values)) return true;
    return norm(key, values[key]) === norm(key, current[key]);
  });

  const origin = values.origin?.trim() || current.origin;
  if (unchanged) {
    if (origin && origin !== current.origin) saveHotelFlightSearch({ ...current, origin });
    return;
  }

  const sameCity = norm("city", values.city) === norm("city", current.city);
  saveHotelFlightSearch({
    ...clean(values),
    ...(origin ? { origin } : {}),
    ...(sameCity && current.hotelId ? { hotelId: current.hotelId } : {}),
  });
}

/* FLIGHTS WRITES ONLY INTO AN EMPTY SEARCH (Ulrik, 2026-09-28). An entry on
 * the Flights page carries to Landing and Hotels only while they hold no
 * entry of their own; otherwise it stays on Flights, in Flights' own copy
 * below, and never clears or replaces what the other pages show. */
export function fillHotelFlightSearchIfEmpty(values: SharedTravelSearch) {
  if (typeof window === "undefined") return;
  const current = readHotelFlightSearch() ?? {};
  if (ENTRY_KEYS.some((key) => (current[key] ?? "").toString().trim())) return;
  if (!ENTRY_KEYS.some((key) => (values[key] ?? "").toString().trim())) return;
  mergeHotelFlightSearch(values);
}

const FLIGHTS_KEY = "oltra_flights_search";

/** The Flights page's own copy of its search, written on every change there
 * (only when it differs, so the timestamp means an entry). */
export function saveFlightsOwnSearch(values: SharedTravelSearch) {
  if (typeof window === "undefined") return;
  const next = clean(values);
  const current = readFlightsOwnSearch();
  if (current) {
    const { savedAt: _ignored, ...rest } = current;
    void _ignored;
    if (JSON.stringify(rest) === JSON.stringify(next)) return;
  }
  try {
    window.sessionStorage.setItem(FLIGHTS_KEY, JSON.stringify({ ...next, savedAt: Date.now() }));
    window.dispatchEvent(new Event("oltra:hotel-flight-search-change"));
  } catch {}
}

function readFlightsOwnSearch(): SharedTravelSearch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FLIGHTS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** What the Flights page (and the header's Flights link) should open on: its
 * own last search, unless a newer one was made on Landing or Hotels — or
 * written by the concierge — in which case that one. */
export function readLatestFlightsSearch(): SharedTravelSearch | null {
  const own = readFlightsOwnSearch();
  const shared = readHotelFlightSearch();
  if (!own) return shared;
  if (!shared) return own;
  return (own.savedAt ?? 0) >= (shared.savedAt ?? 0) ? own : shared;
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

/** Empties the shared search except the departure airport — the landing
 * page's Clear (2026-09-27), so a bare Hotels or Flights visit restores
 * nothing of the search that was cleared. */
export function clearHotelFlightSearch() {
  const origin = readHotelFlightSearch()?.origin;
  saveHotelFlightSearch(origin ? { origin } : {});
}

/** Drops the destination, but only if it is still the one given — so Clear in
 * the concierge takes back the city its conversation set (2026-09-23) and
 * never one picked by hand since. */
export function clearHotelFlightDestinationIf(destination: {
  city: string;
  area: string;
  adminRegion: string;
  country: string;
}) {
  const current = readHotelFlightSearch();
  if (!current) return;
  const same = (a: string | undefined, b: string) => (a ?? "").trim() === b.trim();
  if (!Object.values(destination).some((v) => v.trim())) return;
  if (
    same(current.city, destination.city) &&
    same(current.state, destination.area) &&
    same(current.admin_region, destination.adminRegion) &&
    same(current.country, destination.country)
  ) {
    clearHotelFlightDestination();
  }
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

/** Puts the party back to 2 adults, no children, 1 room, but only if it is
 * still the one given — Clear's counterpart to clearHotelFlightDatesIf for the
 * guests a conversation set (2026-09-24). */
export function clearHotelFlightPartyIf(adults: number, kids: number, rooms: number) {
  const current = readHotelFlightSearch();
  if (!current) return;
  if (
    (current.adults ?? "2") !== String(adults) ||
    (current.kids ?? "0") !== String(kids) ||
    (current.bedrooms ?? "1") !== String(rooms)
  ) {
    return;
  }
  const next: SharedTravelSearch = { ...current, adults: "2", kids: "0", bedrooms: "1" };
  for (const key of KID_AGE_KEYS) delete next[key];
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