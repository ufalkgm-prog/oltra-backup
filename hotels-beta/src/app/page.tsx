import PageShell from "@/components/site/PageShell";
import LandingBackground from "@/components/site/LandingBackground";
import { getHotels } from "@/lib/directus";
import {
  buildHotelsDirectusFilter,
  filterHotelsByMacroRegion,
  filterHotelsByTags,
} from "@/lib/hotelFilters";
import { buildHotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import { guestSelectionIssue, readGuestSelection } from "@/lib/guests";
import { isValidResidencyCode } from "@/lib/countries";
import { isStayTooLong, STAY_TOO_LONG_MESSAGE } from "@/lib/stay";
import { getRestaurantsByCity } from "@/lib/restaurants";
import type { RestaurantRecord } from "@/app/restaurants/types";
import LandingSearchPanel from "./LandingSearchPanel";
import LandingResults from "./LandingResults";
import LandingSummary from "./LandingSummary";
import LandingIntro from "./LandingIntro";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

const CARD_LIMIT = 40;

function normalizeParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

function buildQueryString(params: SearchParams): string {
  const out = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) out.append(key, item);
      }
    } else if (value) {
      out.set(key, value);
    }
  }

  return out.toString();
}

function cleanLabel(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function buildHotelsHeaderLabel(count: number, sp: SearchParams): string {
  const city = cleanLabel(normalizeParam(sp.city));
  const state = cleanLabel(normalizeParam(sp.state));
  const adminRegion = cleanLabel(normalizeParam(sp.admin_region));
  const country = cleanLabel(normalizeParam(sp.country));
  const region = cleanLabel(normalizeParam(sp.region));
  const macroRegion = cleanLabel(normalizeParam(sp.macro_region));
  const location = city || state || adminRegion || country || macroRegion || region;

  const settingValues = normalizeParam(sp.settings)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const activityValues = normalizeParam(sp.activities)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const descriptors: string[] = [];
  if (settingValues.length) {
    descriptors.push(
      `${joinWithAnd(settingValues)} setting${settingValues.length > 1 ? "s" : ""}`
    );
  }
  if (activityValues.length) {
    descriptors.push(
      `${joinWithAnd(activityValues)} ${activityValues.length > 1 ? "activities" : "activity"}`
    );
  }

  let label = `${count} hotel${count === 1 ? "" : "s"}`;

  if (location) label += ` in ${location}`;
  if (descriptors.length) label += ` with ${descriptors.join(" and ")}`;

  if (!location && !descriptors.length) {
    const q = cleanLabel(normalizeParam(sp.q));
    if (q) label += ` matching "${q}"`;
  }

  return label;
}

function pickDestinationCity(
  q: string,
  hotels: Array<{ city?: string | null }>,
  cityParam: string
): string {
  if (cityParam) return cityParam;

  const cities = new Set(hotels.map((h) => cleanLabel(h.city)).filter(Boolean));
  if (cities.size === 1) return [...cities][0];

  return q;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const submitted = normalizeParam(resolvedSearchParams.submitted) === "1";

  const includeHotels = normalizeParam(resolvedSearchParams.include_hotels) !== "0";
  const includeFlights = normalizeParam(resolvedSearchParams.include_flights) === "1";
  const includeRestaurants = normalizeParam(resolvedSearchParams.include_restaurants) === "1";

  const q = normalizeParam(resolvedSearchParams.q).trim();
  const cityParam = normalizeParam(resolvedSearchParams.city).trim();
  const origin = normalizeParam(resolvedSearchParams.origin).trim();
  const fromDate = normalizeParam(resolvedSearchParams.from).trim();
  const toDate = normalizeParam(resolvedSearchParams.to).trim();
  const bedrooms = normalizeParam(resolvedSearchParams.bedrooms).trim();

  const destinationKeys = [
    "q",
    "city",
    "state",
    "admin_region",
    "country",
    "region",
    "macro_region",
    "local_area",
    "affiliation",
    "activities",
    "settings",
    "styles",
  ];
  const hasDestination = destinationKeys.some((key) =>
    Boolean(normalizeParam(resolvedSearchParams[key]).trim())
  );

  const guests = readGuestSelection(resolvedSearchParams);

  // A child without an age, more guests than ETG allow per room, or a stay over
  // ETG's 30 nights is not a priceable stay — nothing is defaulted (§32).
  const hasFullStayDetails =
    Boolean(fromDate) &&
    Boolean(toDate) &&
    !isStayTooLong(fromDate, toDate) &&
    guests.adults > 0 &&
    Boolean(bedrooms) &&
    !guestSelectionIssue(guests, Math.max(1, Number(bedrooms) || 1));
  const stayIssue =
    fromDate && toDate && !hasFullStayDetails
      ? isStayTooLong(fromDate, toDate)
        ? STAY_TOO_LONG_MESSAGE
        : guestSelectionIssue(guests, Math.max(1, Number(bedrooms) || 1))
      : null;
  const childrenAges = guests.kidAges.slice(0, guests.kids).map((age) => Number(age));
  const residencyParam = normalizeParam(resolvedSearchParams.residency).trim().toLowerCase();

  /* The reads below do not depend on each other, so they run together; they
     used to wait in line (metadata, then hotels, then restaurants). Restaurants
     can start early only when the city is in the URL - otherwise the city comes
     from the hotels found. */
  const loadRestaurants = (city: string) =>
    getRestaurantsByCity(city).catch((err) => {
      console.error("[landing] restaurants", err);
      return [] as RestaurantRecord[];
    });
  const earlyRestaurants =
    submitted && hasDestination && cityParam ? loadRestaurants(cityParam) : null;

  const metaHotelsPromise = getHotels({
    fields: [
      "hotel_name",
      "city",
      "state_province_county_island",
      "admin_region",
      "country",
      "region",
      "activities",
      "setting",
    ],
    filter: { published: { _eq: true } },
    limit: -1,
  });

  const hotelsAllPromise = submitted && includeHotels
    ? getHotels({
      fields: [
        // Bulk list — fetched for every hotel in one request. Never add
        // `ratehawk_room_groups` or ratehawk_image_2..50; both are read
        // per-hotel on demand. See CLAUDE.md §29 and §32.
        "id",
        "hotel_name",
        "city",
        "country",
        "region",
        "highlights",
        "ext_points",
        "editor_rank",
        "ratehawk_image_1",
        "ratehawk_image_1_category",
        // Required for the summary cards' price lookup — without it every card
        // falls through to "no price available". (Replaces agoda_hotel_id,
        // which this page no longer prices against.)
        "ratehawk_hid",
        "ratehawk_status",
        "booking_partner",
        // For the card's BOOK link (buildBookingLink).
        "www",
        "booking_provider",
        "booking_URL",
        "booking_enabled",
        "booking_hotel_ref",
        "activities",
        "setting",
        "style",
      ],
      filter: buildHotelsDirectusFilter(resolvedSearchParams),
      sort: ["-editor_rank", "-ext_points", "hotel_name"],
      limit: -1,
    })
    : null;

  const [metaHotels, hotelsAll] = await Promise.all([metaHotelsPromise, hotelsAllPromise]);
  const dataset = buildHotelSuggestionDataset(metaHotels);

  let hotelSummary: {
    count: number;
    names: string[];
    hotels: Awaited<ReturnType<typeof getHotels>>;
  } | null = null;
  let hotelHeaderLabel = "Hotels";
  let destinationCity = cityParam || q;
  // Whether the search narrowed to one city, by name or by the hotels found.
  let searchIsOneCity = Boolean(cityParam);

  if (hotelsAll) {
    const hotels = filterHotelsByMacroRegion(filterHotelsByTags(hotelsAll, {
      activities: normalizeParam(resolvedSearchParams.activities).split(",").map((s) => s.trim()).filter(Boolean),
      settings: normalizeParam(resolvedSearchParams.settings).split(",").map((s) => s.trim()).filter(Boolean),
      styles: normalizeParam(resolvedSearchParams.styles).split(",").map((s) => s.trim()).filter(Boolean),
    }), resolvedSearchParams);

    const names = hotels.map((h: any) => h.hotel_name ?? "").filter(Boolean);

    hotelSummary = {
      count: hotels.length,
      names,
      hotels: hotels.slice(0, CARD_LIMIT),
    };

    hotelHeaderLabel = buildHotelsHeaderLabel(hotels.length, resolvedSearchParams);

    destinationCity = pickDestinationCity(q, hotels, cityParam);
    searchIsOneCity ||= new Set(hotels.map((h) => cleanLabel(h.city)).filter(Boolean)).size === 1;
  }

  /* The city's restaurants — the same list the Restaurants page draws for it,
     alias fallback included (Ulrik, 2026-09-27). Looked up whether or not
     Restaurants is ticked, because the checkbox is passive when the
     destination is not a city we hold restaurants in (Ulrik, 2026-09-28):
     there is no pane saying "we don't hold…" any more, because it can no
     longer be asked for. */
  let cityRestaurants: RestaurantRecord[] = [];
  if (earlyRestaurants) {
    cityRestaurants = await earlyRestaurants;
  } else if (submitted && hasDestination && destinationCity) {
    cityRestaurants = await loadRestaurants(destinationCity);
  }
  const restaurantsAvailable = cityRestaurants.length > 0;
  const showRestaurants = submitted && hasDestination && includeRestaurants && restaurantsAvailable;
  /* A country or region asked for restaurants gets an empty pane that asks
     for a city, as Flights asks for a more specific search (2026-10-05 test
     pass: the pane vanished without a word). A city we hold none in still
     shows no pane (2026-09-28). */
  const restaurantsNeedCity =
    submitted && hasDestination && includeRestaurants && !restaurantsAvailable && !searchIsOneCity;
  const restaurants: RestaurantRecord[] | null = showRestaurants
    ? cityRestaurants
    : restaurantsNeedCity
      ? []
      : null;

  const sharedQuery = buildQueryString({
    ...resolvedSearchParams,
    submitted: undefined,
  });

  const hotelsHref = `/hotels${sharedQuery ? `?${sharedQuery}` : ""}`;
  const flightsHref = `/flights${sharedQuery ? `?${sharedQuery}` : ""}`;

  const citySet = normalizeParam(resolvedSearchParams.city).trim();
  const activitiesSet = normalizeParam(resolvedSearchParams.activities).trim();
  const narrowSuggestion: "city" | "purpose" | null = !citySet
    ? "city"
    : !activitiesSet
    ? "purpose"
    : null;

  return (
    <PageShell current="" disableBackground>
      <LandingBackground />

      <main className={styles.landingPage}>
        <section className={styles.heroPanel}>
          <LandingSearchPanel
            initialSearchParams={resolvedSearchParams}
            dataset={dataset}
          />

          {/* The structured summary and the concierge's frames are alternative
              views of the same region, so one component picks between them.
              The provider they both read from now lives in the root layout —
              it used to wrap just this section, which is why a conversation
              did not survive leaving the landing page. */}
          <LandingResults
            classicCity={submitted && hasDestination ? destinationCity : ""}
            classicPanes={{
              hotels: submitted && hasDestination && includeHotels,
              flights: submitted && hasDestination && includeFlights,
              restaurants: restaurants !== null,
            }}
            summary={
              submitted && hasDestination ? (
                <LandingSummary
                  hotelSummary={hotelSummary}
                  hotelHeaderLabel={hotelHeaderLabel}
                  includeHotels={includeHotels}
                  includeFlights={includeFlights}
                  restaurants={restaurants}
                  origin={origin}
                  destinationCity={destinationCity}
                  fromDate={fromDate}
                  toDate={toDate}
                  adults={guests.adults}
                  kids={guests.kids}
                  bedrooms={Math.max(1, Number(bedrooms) || 1)}
                  childrenAges={childrenAges}
                  residency={isValidResidencyCode(residencyParam) ? residencyParam : ""}
                  hasFullStayDetails={hasFullStayDetails}
                  stayIssue={stayIssue}
                  hotelsHref={hotelsHref}
                  flightsHref={flightsHref}
                  narrowSuggestion={narrowSuggestion}
                />
              ) : null
            }
          />

          <LandingIntro summaryShown={submitted && hasDestination} />
        </section>
      </main>
    </PageShell>
  );
}
