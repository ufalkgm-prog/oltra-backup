import Link from "next/link";
import PageShell from "@/components/site/PageShell";
import LandingBackground from "@/components/site/LandingBackground";
import { getHotels } from "@/lib/directus";
import { buildHotelsDirectusFilter } from "@/lib/hotelFilters";
import { getHotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import { getRestaurantCities, getRestaurantsByCity } from "@/lib/restaurants";
import LandingSearchPanel from "./LandingSearchPanel";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function normalizeParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

function listFromParam(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v].filter(Boolean);
}

function buildQueryString(params: SearchParams): string {
  const out = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) out.append(key, item);
    } else {
      out.set(key, value);
    }
  }

  return out.toString();
}

function findRestaurantCityMatch(query: string, cityOptions: string[]): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const exact = cityOptions.find((city) => city.toLowerCase() === q);
  if (exact) return exact;

  const included = cityOptions.find((city) => q.includes(city.toLowerCase()));
  if (included) return included;

  const reverseIncluded = cityOptions.find((city) => city.toLowerCase().includes(q));
  if (reverseIncluded) return reverseIncluded;

  return null;
}

function cleanLabel(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function pickHotelGeographyLabel(
  q: string,
  hotels: Array<{
    city?: string | null;
    country?: string | null;
    region?: string | null;
  }>
): string {
  if (!hotels.length) return q || "selected destination";

  const cities = new Set(hotels.map((h) => cleanLabel(h.city)).filter(Boolean));
  const countries = new Set(hotels.map((h) => cleanLabel(h.country)).filter(Boolean));
  const regions = new Set(hotels.map((h) => cleanLabel(h.region)).filter(Boolean));

  if (cities.size === 1) return [...cities][0];
  if (countries.size === 1) return [...countries][0];
  if (regions.size === 1) return [...regions][0];

  return q || "selected destination";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const submitted = normalizeParam(resolvedSearchParams.submitted) === "1";

  const selectedIncludes = listFromParam(resolvedSearchParams.include);
  const includes = selectedIncludes.length ? selectedIncludes : ["hotels"];

  const q = normalizeParam(resolvedSearchParams.q).trim();

  const [dataset, restaurantCities] = await Promise.all([
    getHotelSuggestionDataset(),
    getRestaurantCities(),
  ]);

  let hotelCount: number | null = null;
  let hotelLine: string | null = null;
  let restaurantCity: string | null = null;
  let restaurantNames: string[] = [];
  let restaurantCount: number | null = null;
  let restaurantLine: string | null = null;
  let flightLine: string | null = null;

  if (submitted && includes.includes("hotels")) {
    const filter = buildHotelsDirectusFilter(resolvedSearchParams);
    const hotels = await getHotels({
      fields: ["id", "hotel_name", "city", "country", "region"],
      filter,
      sort: ["-editor_rank_13", "-ext_points", "hotel_name"],
    });

    hotelCount = hotels.length;

    const geography = pickHotelGeographyLabel(q, hotels);

    if (hotelCount === 0) {
      hotelLine = `0 hotels identified in ${geography}`;
    } else if (hotelCount < 6) {
      const hotelNames = hotels
        .map((item: any) => item.hotel_name ?? "")
        .filter(Boolean)
        .sort((a: string, b: string) => a.localeCompare(b));

      hotelLine = `${hotelCount} hotels identified in ${geography}: ${hotelNames.join(", ")}`;
    } else {
      hotelLine = `${hotelCount} hotels identified in ${geography}`;
    }
  }

  if (submitted && includes.includes("flights")) {
    flightLine = q
      ? `Several relevant flights identified. Most convenient routing for ${q} will appear here once the flight API is connected.`
      : "Several relevant flights identified. Most convenient routing will appear here once the flight API is connected.";
  }

  if (submitted && includes.includes("restaurants")) {
    restaurantCity = findRestaurantCityMatch(q, restaurantCities);

    if (restaurantCity) {
      const restaurants = await getRestaurantsByCity(restaurantCity);

      restaurantCount = restaurants.length;

      restaurantNames = restaurants
        .slice(0, 3)
        .map((item: any) => item.restaurant_name ?? item.name ?? "")
        .filter(Boolean);

      if (restaurantCount === 0) {
        restaurantLine = `0 top restaurants identified in ${restaurantCity}`;
      } else if (restaurantNames.length >= 3) {
        restaurantLine = `${restaurantCount} top restaurants identified in ${restaurantCity} including most notably ${restaurantNames[0]}, ${restaurantNames[1]} and ${restaurantNames[2]}`;
      } else if (restaurantNames.length > 0) {
        restaurantLine = `${restaurantCount} top restaurants identified in ${restaurantCity}: ${restaurantNames.join(", ")}`;
      } else {
        restaurantLine = `${restaurantCount} top restaurants identified in ${restaurantCity}`;
      }
    } else {
      restaurantLine = q
        ? `Restaurant preview currently supports direct city matches only. No covered restaurant city matched “${q}”.`
        : "Enter a covered restaurant city to preview restaurants here.";
    }
  }

  const sharedQuery = buildQueryString({
    ...resolvedSearchParams,
    submitted: undefined,
  });

  const hotelsHref = `/hotels${sharedQuery ? `?${sharedQuery}` : ""}`;
  const flightsHref = `/flights${sharedQuery ? `?${sharedQuery}` : ""}`;

  const restaurantsQuery = new URLSearchParams();
  if (restaurantCity) {
    restaurantsQuery.set("city", restaurantCity);
  } else if (q) {
    restaurantsQuery.set("city", q);
  }
  const restaurantsHref = `/restaurants${
    restaurantsQuery.toString() ? `?${restaurantsQuery.toString()}` : ""
  }`;

  return (
    <PageShell current="" disableBackground>
      <LandingBackground />

      <main className={styles.landingPage}>
        <section className={styles.heroPanel}>
          <LandingSearchPanel
            initialSearchParams={resolvedSearchParams}
            selectedIncludes={includes}
            dataset={dataset}
          />

          {submitted ? (
            <div className={`oltra-glass oltra-panel ${styles.summaryPanel}`}>
              <div className={styles.summaryHeader}>
                <div className="oltra-label">Search overview</div>
                <div className={styles.summarySubhead}>
                  {q ? `Results for “${q}”` : "Results for your current criteria"}
                </div>
              </div>

              <div className={styles.summaryLines}>
                {includes.includes("hotels") && hotelLine ? (
                  <div className={styles.summaryLine}>{hotelLine}</div>
                ) : null}

                {includes.includes("flights") && flightLine ? (
                  <div className={styles.summaryLine}>{flightLine}</div>
                ) : null}

                {includes.includes("restaurants") && restaurantLine ? (
                  <div className={styles.summaryLine}>{restaurantLine}</div>
                ) : null}
              </div>

              <div className={styles.summaryActions}>
                {includes.includes("hotels") ? (
                  <Link
                    href={hotelsHref}
                    className={`oltra-button-primary ${styles.summaryButton}`}
                    prefetch={false}
                  >
                    Hotels
                  </Link>
                ) : null}

                {includes.includes("flights") ? (
                  <Link
                    href={flightsHref}
                    className={`oltra-button-primary ${styles.summaryButton}`}
                    prefetch={false}
                  >
                    Flights
                  </Link>
                ) : null}

                {includes.includes("restaurants") ? (
                  <Link
                    href={restaurantsHref}
                    className={`oltra-button-primary ${styles.summaryButton}`}
                    prefetch={false}
                  >
                    Restaurants
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </PageShell>
  );
}