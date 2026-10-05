/* Favourites city by city (Ulrik, 2026-10-05): cities A to Z, and inside a
 * city by name, so the two-column grid under each city header reads left to
 * right, then down. Shared by Favorite hotels and Favorite restaurants. */
export type CityGroup<T> = { city: string; items: T[] };

export function groupByCity<T>(
  items: T[],
  cityOf: (item: T) => string,
  nameOf: (item: T) => string
): CityGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const city = cityOf(item).trim() || "Other";
    const group = groups.get(city);
    if (group) group.push(item);
    else groups.set(city, [item]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([city, group]) => ({
      city,
      items: [...group].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    }));
}

/** The city from a stored "City, Country" label, for a favourite whose live
 * record has not loaded (or no longer exists). */
export function cityFromLocation(location: string | null | undefined): string {
  return (location ?? "").split(",")[0]?.trim() ?? "";
}
