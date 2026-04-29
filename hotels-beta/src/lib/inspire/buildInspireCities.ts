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
    usa: "USA",
    us: "USA",

    "united arab emirates": "UAE",
    uae: "UAE",

    "united kingdom": "England",
    uk: "England",
    england: "England",

    "turks and caicos": "Turks & Caicos Islands",
    "turks & caicos": "Turks & Caicos Islands",

    russia: "Russia",
  };

  return map[c] ?? country.trim();
}

function normalizeCity(city: string): string {
  const c = city.trim().toLowerCase();

  const map: Record<string, string> = {
    "st tropez": "Saint Tropez",
    "st. tropez": "Saint Tropez",
    nyc: "New York",
    "new york city": "New York",
    la: "Los Angeles",
  };

  return map[c] ?? city.trim();
}

function normalizeAgodaImage(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const u = new URL(url);
    u.search = "";
    u.protocol = "https:";
    return u.toString();
  } catch {
    return url;
  }
}

export async function buildInspireCities(): Promise<InspireCity[]> {
  const hotels = (await getHotels({
    fields: [
      "id",
      "hotelid",
      "hotel_name",
      "published",
      "city",
      "country",
      "region",
      "lat",
      "lng",
      "agoda_photo1",
    ],
    filter: {
      published: { _eq: true },
    },
    limit: -1,
    sort: ["city", "country"],
  })) as Array<{
    id: string | number;
    hotelid?: string | number | null;
    hotel_name?: string | null;
    city?: string | null;
    country?: string | null;
    region?: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
    agoda_photo1?: string | null;
  }>;

  const grouped = new Map<
    string,
    {
      city: string;
      country: string;
      region: string;
      hotelCount: number;
      hotels: Array<{
        id: string;
        hotelid: string;
        hotel_name: string;
        lat: number;
        lng: number;
        thumbnail?: string | null;
      }>;
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
        hotels: [],
      });
    }

    const group = grouped.get(key)!;
    group.hotelCount += 1;

    const lat = Number(hotel.lat);
    const lng = Number(hotel.lng);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      group.hotels.push({
        id: String(hotel.id),
        hotelid: String(hotel.hotelid ?? hotel.id),
        hotel_name: String(hotel.hotel_name ?? "Untitled hotel"),
        lat,
        lng,
        thumbnail: normalizeAgodaImage(hotel.agoda_photo1),
      });
    }
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
        normalizeCountry(item.country).toLowerCase() ===
          entry.country.toLowerCase()
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
      hotels: entry.hotels,
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