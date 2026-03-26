import { estimateFlightHours } from "./estimateFlightHours";
import type { InspireCity, InspireCityMatch, InspireFilters } from "./types";

function scorePurpose(city: InspireCity, purpose: InspireFilters["purpose"]): number {
  if (!purpose) return 0;
  return city.purposes.includes(purpose) ? 100 : 0;
}

function passesPurpose(city: InspireCity, purpose: InspireFilters["purpose"]): boolean {
  if (!purpose) return true;
  if (!city.purposes.includes(purpose)) return false;

  if (purpose === "beach" && !city.coastal) return false;
  if (purpose === "ski" && !city.ski) return false;

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

    if (!passesPurpose(city, filters.purpose)) continue;

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