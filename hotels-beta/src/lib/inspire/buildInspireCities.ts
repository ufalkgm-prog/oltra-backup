import "server-only";

import { getHotels } from "@/lib/directus";
import { INSPIRE_CITY_METADATA } from "./cityMetadata";
import type { InspireCity } from "./types";

function cityKey(city: string, country: string): string {
  return `${city}__${country}`.toLowerCase();
}

function normalizeCountry(country: string): string {
  const c = country.trim().toLowerCase();

  const map: Record<string, string> = {
    "united states": "USA",
    "usa": "USA",
    "us": "USA",

    "united arab emirates": "UAE",
    "uae": "UAE",

    "united kingdom": "England",
    "uk": "England",
    "england": "England",

    "turks and caicos": "Turks & Caicos Islands",
    "turks & caicos": "Turks & Caicos Islands",

    "russia": "Russia",
  };

  return map[c] ?? country.trim();
}

function normalizeCity(city: string): string {
  const c = city.trim().toLowerCase();

  const map: Record<string, string> = {
    "st tropez": "Saint Tropez",
    "st. tropez": "Saint Tropez",

    "nyc": "New York",
    "new york city": "New York",

    "la": "Los Angeles",
  };

  return map[c] ?? city.trim();
}

export async function buildInspireCities(): Promise<InspireCity[]> {
  const hotels = await getHotels({
    fields: ["id", "published", "city", "country", "region"],
    filter: {
      published: { _eq: true },
    },
    limit: -1,
    sort: ["city", "country"],
  });

  const grouped = new Map<
    string,
    {
      city: string;
      country: string;
      region: string;
      hotelCount: number;
    }
  >();

  for (const hotel of hotels) {
    const rawCity = hotel.city?.trim();
    const rawCountry = hotel.country?.trim();

    if (!rawCity || !rawCountry) continue;

    const city = normalizeCity(rawCity);
    const country = normalizeCountry(rawCountry);
    const region = hotel.region?.trim() ?? "";

    const key = cityKey(city, country);

    if (!grouped.has(key)) {
      grouped.set(key, {
        city,
        country,
        region,
        hotelCount: 0,
      });
    }

    grouped.get(key)!.hotelCount += 1;
  }

  const cities: InspireCity[] = [];
  const unmatched: Array<{
    city: string;
    country: string;
    region: string;
    hotelCount: number;
  }> = [];

  for (const entry of grouped.values()) {
    const metadata = INSPIRE_CITY_METADATA.find(
      (item) =>
        normalizeCity(item.city).toLowerCase() === entry.city.toLowerCase() &&
        normalizeCountry(item.country).toLowerCase() === entry.country.toLowerCase()
    );

    if (!metadata) {
      unmatched.push(entry);
      continue;
    }

    cities.push({
      id: cityKey(entry.city, entry.country),
      city: entry.city,
      country: entry.country,
      region: entry.region,
      lat: metadata.lat,
      lng: metadata.lng,
      hotelCount: entry.hotelCount,
      purposes: metadata.purposes,
      coastal: metadata.coastal,
      ski: metadata.ski,
      monthlyAvgTempC: metadata.monthlyAvgTempC,
    });
  }

  if (process.env.NODE_ENV !== "production") {
    const unmatchedSorted = [...unmatched].sort(
      (a, b) => b.hotelCount - a.hotelCount
    );
    const topUnmatched = unmatchedSorted.slice(0, 40);

    console.log("INSPIRE matched cities:", cities.length);
    console.log("INSPIRE unmatched cities:", unmatchedSorted.length);

    if (topUnmatched.length) {
      console.log(
        "INSPIRE top unmatched cities:",
        topUnmatched.map(
          (item) => `${item.city}, ${item.country} (${item.hotelCount})`
        )
      );
    }
  }

  return cities.sort((a, b) => b.hotelCount - a.hotelCount);
}
