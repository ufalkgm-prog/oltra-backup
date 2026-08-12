import { estimateFlightHours } from "./estimateFlightHours";
import type { InspireCity, InspireCityMatch, InspireFilters } from "./types";

// Season-appropriateness thresholds for the two temperature-sensitive
// purposes, applied on top of the static beach/ski flags. Calibrated
// against the real monthlyAvgTempC data in cityMetadata.ts: beach-purpose
// cities range ~9-28°C across the year (Mediterranean towns like Saint
// Tropez/Mykonos dip to 9-16°C in winter and shouldn't read as "beach
// weather"; Gulf/Caribbean destinations stay 18°C+ year-round), and
// alpine ski-purpose resort towns run roughly -7 to 3°C through their real
// Nov-April season versus 8-15°C by June (gateway cities like Geneva/Zurich,
// which are warmer overall, mostly drop out except deep winter - they
// aren't real ski destinations themselves). Neither bound is exact physics,
// they're a reasonable proxy from the data actually available.
const MIN_BEACH_TEMP_C = 18;
const MAX_SKI_TEMP_C = 3;

function scorePurpose(city: InspireCity, purpose: InspireFilters["purpose"]): number {
  if (!purpose) return 0;
  return city.purposes.includes(purpose) ? 100 : 0;
}

function passesPurpose(
  city: InspireCity,
  purpose: InspireFilters["purpose"],
  month: InspireFilters["month"]
): boolean {
  if (!purpose) return true;
  if (!city.purposes.includes(purpose)) return false;

  if (purpose === "beach") {
    if (!city.coastal) return false;
    if (city.monthlyAvgTempC[month] < MIN_BEACH_TEMP_C) return false;
  }

  if (purpose === "ski") {
    if (!city.ski) return false;
    if (city.monthlyAvgTempC[month] > MAX_SKI_TEMP_C) return false;
  }

  return true;
}

export function filterInspireCities(
  cities: InspireCity[],
  filters: InspireFilters
): InspireCityMatch[] {
  const matches: InspireCityMatch[] = [];

  for (const city of cities) {
    const estimatedFlightHours = estimateFlightHours(
      filters.originLat,
      filters.originLng,
      city.lat,
      city.lng
    );

    if (estimatedFlightHours > filters.maxFlightHours) continue;

    const selectedMonthTempC = city.monthlyAvgTempC[filters.month];

    if (!passesPurpose(city, filters.purpose, filters.month)) continue;

    matches.push({
      city,
      estimatedFlightHours,
      selectedMonthTempC,
      purposeScore: scorePurpose(city, filters.purpose),
    });
  }

  return matches.sort((a, b) => {
    if (b.purposeScore !== a.purposeScore) {
      return b.purposeScore - a.purposeScore;
    }

    if (b.city.hotelCount !== a.city.hotelCount) {
      return b.city.hotelCount - a.city.hotelCount;
    }

    return a.estimatedFlightHours - b.estimatedFlightHours;
  });
}