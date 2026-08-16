import PageShell from "@/components/site/PageShell";
import LandingBackground from "@/components/site/LandingBackground";
import { getHotels } from "@/lib/directus";
import { buildHotelsDirectusFilter, filterHotelsByTags } from "@/lib/hotelFilters";
import { buildHotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import { readGuestSelection } from "@/lib/guests";
import LandingSearchPanel from "./LandingSearchPanel";
import LandingSummary from "./LandingSummary";
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
  const country = cleanLabel(normalizeParam(sp.country));
  const region = cleanLabel(normalizeParam(sp.region));
  const location = city || country || region;

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

  const metaHotels = await getHotels({
    fields: ["hotel_name", "city", "country", "region", "activities", "setting"],
    filter: { published: { _eq: true } },
    limit: -1,
  });
  const dataset = buildHotelSuggestionDataset(metaHotels);

  let hotelSummary: {
    count: number;
    names: string[];
    hotels: Awaited<ReturnType<typeof getHotels>>;
  } | null = null;
  let hotelHeaderLabel = "Hotels";
  let destinationCity = cityParam || q;

  if (submitted && includeHotels) {
    const filter = buildHotelsDirectusFilter(resolvedSearchParams);

    const hotelsAll = await getHotels({
      fields: [
        "id",
        "hotel_name",
        "city",
        "country",
        "region",
        "highlights",
        "ext_points",
        "editor_rank",
        "agoda_photo1",
        "agoda_photo2",
        "agoda_photo3",
        "agoda_photo4",
        "agoda_photo5",
        "ratehawk_image_1",
        "ratehawk_image_1_category",
        // Required for the summary cards' price lookup — without it every card
        // falls through to "no price available". (Replaces agoda_hotel_id,
        // which this page no longer prices against.)
        "ratehawk_hid",
        "activities",
        "setting",
        "style",
      ],
      filter,
      sort: ["-editor_rank", "-ext_points", "hotel_name"],
      limit: -1,
    });

    const hotels = filterHotelsByTags(hotelsAll, {
      activities: normalizeParam(resolvedSearchParams.activities).split(",").map((s) => s.trim()).filter(Boolean),
      settings: normalizeParam(resolvedSearchParams.settings).split(",").map((s) => s.trim()).filter(Boolean),
      styles: normalizeParam(resolvedSearchParams.styles).split(",").map((s) => s.trim()).filter(Boolean),
    });

    const names = hotels.map((h: any) => h.hotel_name ?? "").filter(Boolean);

    hotelSummary = {
      count: hotels.length,
      names,
      hotels: hotels.slice(0, CARD_LIMIT),
    };

    hotelHeaderLabel = buildHotelsHeaderLabel(hotels.length, resolvedSearchParams);

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
              hotelHeaderLabel={hotelHeaderLabel}
              includeHotels={includeHotels}
              includeFlights={includeFlights}
              origin={origin}
              destinationCity={destinationCity}
              fromDate={fromDate}
              toDate={toDate}
              adults={guests.adults}
              kids={guests.kids}
              bedrooms={Math.max(1, Number(bedrooms) || 1)}
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
