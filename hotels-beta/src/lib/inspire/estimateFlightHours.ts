function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* Scheduled nonstop time, gate to gate, from the great-circle distance.
 *
 * Distance / 750 km/h ran short everywhere, most on short routes, because a
 * schedule also holds taxi, climb and descent: Copenhagen-London read 1.3h
 * (flown in about 1h55), Copenhagen-Heraklion 3.4h (about 3h45). Half an hour
 * plus 800 km/h lands within ten minutes or so of real timetables from an hour
 * to twelve (Naples 2.6h vs 2h40, Dubai 5.9h vs 6h, Bangkok 11.3h vs 11h).
 * Still an estimate - it knows nothing of winds, routings or whether a nonstop
 * exists - and the concierge says so. Shared by the Inspire page and the
 * concierge (lib/ai/flightTime.ts) so the two cannot disagree. */
const FIXED_HOURS = 0.5;
const CRUISE_KMH = 800;

export function flightHoursForDistance(distanceKm: number): number {
  return Number((FIXED_HOURS + distanceKm / CRUISE_KMH).toFixed(1));
}

export function estimateFlightHours(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number
): number {
  return flightHoursForDistance(
    haversineKm(originLat, originLng, destinationLat, destinationLng)
  );
}