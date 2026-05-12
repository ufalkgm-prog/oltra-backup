import PageShell from "@/components/site/PageShell";
import LandingBackground from "@/components/site/LandingBackground";
import { getHotels } from "@/lib/directus";
import { buildHotelsDirectusFilter } from "@/lib/hotelFilters";
import { getHotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import { readGuestSelection } from "@/lib/guests";
import LandingSearchPanel from "./LandingSearchPanel";
import LandingSummary from "./LandingSummary";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

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

  const q = normalizeParam(resolvedSearchParams.q).trim();
  const cityParam = normalizeParam(resolvedSearchParams.city).trim();
  const origin = normalizeParam(resolvedSearchParams.origin).trim();
  const fromDate = normalizeParam(resolvedSearchParams.from).trim();
  const toDate = normalizeParam(resolvedSearchParams.to).trim();
  const bedrooms = normalizeParam(resolvedSearchParams.bedrooms).trim();

  const destinationKeys = [
    "q",
    "city",
    "country",
    "region",
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

  const hasFullStayDetails =
    Boolean(fromDate) && Boolean(toDate) && guests.adults > 0 && Boolean(bedrooms);

  const dataset = await getHotelSuggestionDataset();

  let hotelSummary: {
    count: number;
    geography: string;
    names: string[];
    hotels: Awaited<ReturnType<typeof getHotels>>;
  } | null = null;
  let destinationCity = cityParam || q;

  if (submitted && includeHotels) {
    const filter = buildHotelsDirectusFilter(resolvedSearchParams);

    const hotels = await getHotels({
      fields: [
        "id",
        "hotelid",
        "hotel_name",
        "city",
        "country",
        "region",
        "highlights",
        "ext_points",
        "editor_rank_13",
        "agoda_photo1",
        "agoda_photo2",
        "agoda_photo3",
        "agoda_photo4",
        "agoda_photo5",
        "agoda_hotel_id",
      ],
      filter,
      sort: ["-editor_rank_13", "-ext_points", "hotel_name"],
    });

    const geography = pickHotelGeographyLabel(q, hotels);
    const names = hotels.map((h: any) => h.hotel_name ?? "").filter(Boolean);

    hotelSummary = {
      count: hotels.length,
      geography,
      names,
      hotels: hotels.slice(0, 20),
    };

    destinationCity = pickDestinationCity(q, hotels, cityParam);
  }

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

          {submitted && hasDestination ? (
            <LandingSummary
              hotelSummary={hotelSummary}
              includeHotels={includeHotels}
              includeFlights={includeFlights}
              origin={origin}
              destinationCity={destinationCity}
              fromDate={fromDate}
              toDate={toDate}
              adults={guests.adults}
              kids={guests.kids}
              hasFullStayDetails={hasFullStayDetails}
              hotelsHref={hotelsHref}
              flightsHref={flightsHref}
              narrowSuggestion={narrowSuggestion}
            />
          ) : null}
        </section>
      </main>
    </PageShell>
  );
}
