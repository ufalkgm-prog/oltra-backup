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

export function estimateFlightHours(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number
): number {
  const distanceKm = haversineKm(
    originLat,
    originLng,
    destinationLat,
    destinationLng
  );

  // MVP approximation for direct-flight duration
  return Number((distanceKm / 750).toFixed(1));
}