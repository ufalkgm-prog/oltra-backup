import "server-only";

export type LandingCategory = "hotels" | "flights" | "restaurants";

export type LandingHotelItem = {
  id?: string | number;
  hotel_name?: string | null;
  city?: string | null;
  country?: string | null;
  region?: string | null;
};

export type LandingRestaurantItem = {
  id?: string | number;
  restaurant_name?: string | null;
  city?: string | null;
  country?: string | null;
  region?: string | null;
  editor_rank_13?: number | null;
};

export type LandingFlightSummary = {
  originCity?: string | null;
  destinationCity?: string | null;
  outboundAirline?: string | null;
  outboundFlightNo?: string | null;
  outboundDepartureLocal?: string | null;
  outboundArrivalLocal?: string | null;
  returnAirline?: string | null;
  returnFlightNo?: string | null;
  returnDepartureLocal?: string | null;
  returnArrivalLocal?: string | null;
};

export type LandingSummaryInput = {
  enabledCategories: LandingCategory[];
  destinationLabel: string;
  hotels: LandingHotelItem[];
  restaurants: LandingRestaurantItem[];
  flightSummary?: LandingFlightSummary | null;
  singleCityRestaurantMode?: boolean;
};

export type LandingSummaryOutput = {
  hotelLine: string | null;
  flightLine: string | null;
  restaurantLine: string | null;
};

function clean(value?: string | null): string {
  return (value ?? "").trim();
}

function pickGeographyLabel(
  destinationLabel: string,
  items: Array<{
    city?: string | null;
    country?: string | null;
    region?: string | null;
  }>
): string {
  if (!items.length) return destinationLabel;

  const cities = new Set(items.map((x) => clean(x.city)).filter(Boolean));
  const countries = new Set(items.map((x) => clean(x.country)).filter(Boolean));
  const regions = new Set(items.map((x) => clean(x.region)).filter(Boolean));

  if (cities.size === 1) return [...cities][0];
  if (countries.size === 1) return [...countries][0];
  if (regions.size === 1) return [...regions][0];

  return destinationLabel;
}

function sortHotelNamesAlphabetically(hotels: LandingHotelItem[]): string[] {
  return hotels
    .map((h) => clean(h.hotel_name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function sortRestaurantsForTopThree(
  restaurants: LandingRestaurantItem[]
): LandingRestaurantItem[] {
  return [...restaurants].sort((a, b) => {
    const aRank =
      typeof a.editor_rank_13 === "number" ? a.editor_rank_13 : Number.POSITIVE_INFINITY;
    const bRank =
      typeof b.editor_rank_13 === "number" ? b.editor_rank_13 : Number.POSITIVE_INFINITY;

    if (aRank !== bRank) return aRank - bRank;

    return clean(a.restaurant_name).localeCompare(clean(b.restaurant_name));
  });
}

export function buildLandingSummary(
  input: LandingSummaryInput
): LandingSummaryOutput {
  const enabled = new Set(input.enabledCategories);

  let hotelLine: string | null = null;
  let flightLine: string | null = null;
  let restaurantLine: string | null = null;

  if (enabled.has("hotels")) {
    const hotelCount = input.hotels.length;
    const geo = pickGeographyLabel(input.destinationLabel, input.hotels);

    if (hotelCount === 0) {
      hotelLine = `0 hotels identified in ${geo}`;
    } else if (hotelCount < 6) {
      const names = sortHotelNamesAlphabetically(input.hotels);
      hotelLine = `${hotelCount} hotels identified in ${geo}: ${names.join(", ")}`;
    } else {
      hotelLine = `${hotelCount} hotels identified in ${geo}`;
    }
  }

  if (enabled.has("flights")) {
    const f = input.flightSummary;

    if (
      f?.originCity &&
      f?.destinationCity &&
      f?.outboundAirline &&
      f?.outboundFlightNo &&
      f?.outboundDepartureLocal &&
      f?.outboundArrivalLocal &&
      f?.returnAirline &&
      f?.returnFlightNo &&
      f?.returnDepartureLocal &&
      f?.returnArrivalLocal
    ) {
      flightLine =
        `Several relevant flights identified. Most convenient ${f.originCity} to ${f.destinationCity} ` +
        `is ${f.outboundAirline} flight ${f.outboundFlightNo} departing ${f.outboundDepartureLocal} ` +
        `and landing ${f.outboundArrivalLocal} local time, return with ${f.returnAirline} ` +
        `flight ${f.returnFlightNo} departing ${f.returnDepartureLocal} and landing ${f.returnArrivalLocal} local time`;
    } else {
      flightLine = "Several relevant flights identified.";
    }
  }

  if (enabled.has("restaurants")) {
    const restaurantCount = input.restaurants.length;

    if (restaurantCount === 0) {
      restaurantLine = `0 top restaurants identified in ${input.destinationLabel}`;
    } else {
      const cities = new Set(
        input.restaurants.map((r) => clean(r.city)).filter(Boolean)
      );
      const singleCity =
        typeof input.singleCityRestaurantMode === "boolean"
          ? input.singleCityRestaurantMode
          : cities.size === 1;

      if (singleCity) {
        const city =
          cities.size === 1 ? [...cities][0] : input.destinationLabel;
        const top3 = sortRestaurantsForTopThree(input.restaurants)
          .slice(0, 3)
          .map((r) => clean(r.restaurant_name))
          .filter(Boolean);

        if (top3.length >= 3) {
          restaurantLine =
            `${restaurantCount} top restaurants identified in ${city} including most notably ` +
            `${top3[0]}, ${top3[1]} and ${top3[2]}`;
        } else if (top3.length > 0) {
          restaurantLine =
            `${restaurantCount} top restaurants identified in ${city}: ${top3.join(", ")}`;
        } else {
          restaurantLine = `${restaurantCount} top restaurants identified in ${city}`;
        }
      } else {
        restaurantLine = `${restaurantCount} top restaurants identified across selected destinations`;
      }
    }
  }

  return {
    hotelLine,
    flightLine,
    restaurantLine,
  };
}