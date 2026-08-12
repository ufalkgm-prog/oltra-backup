import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import RestaurantsMapView from "./ui/RestaurantsMapView";
import { getRestaurantCities, getRestaurantsByCity } from "@/lib/restaurants";
import { expandCityAliases } from "@/lib/locationAliases";
import { getHotels } from "@/lib/directus";
import "./restaurants.css";

export const metadata: Metadata = {
  title: "Restaurants",
  description: "Curated luxury restaurants worldwide.",
};

type PageSearchParams = Record<string, string | string[] | undefined>;

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export default async function RestaurantsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const requestedCity = normalizeParam(params.city).trim();

  const cityOptions = await getRestaurantCities();
  const parisMatch =
    cityOptions.find((option) => option.toLowerCase() === "paris") ?? "";
  const fallbackCity = parisMatch || cityOptions[0] || "";

  const requestedCityMatch =
    cityOptions.find(
      (option) => option.toLowerCase() === requestedCity.toLowerCase()
    ) ?? "";

  const requestedCityAliases = requestedCity
    ? expandCityAliases([requestedCity])
    : [];

  const aliasCityMatch =
    requestedCityAliases
      .map((alias) =>
        cityOptions.find(
          (option) => option.toLowerCase() === alias.toLowerCase()
        )
      )
      .find(Boolean) ?? "";

  const activeCity = requestedCityMatch || aliasCityMatch || fallbackCity;

  const cityAliases = activeCity ? expandCityAliases([activeCity]) : [];

  const restaurantBatches = cityAliases.length
    ? await Promise.all(cityAliases.map((city) => getRestaurantsByCity(city)))
    : [];

  const restaurants = Array.from(
    new Map(
      restaurantBatches
        .flat()
        .map((restaurant) => [String(restaurant.id), restaurant])
    ).values()
  ).sort((a, b) =>
    (a.restaurant_name ?? "").localeCompare(b.restaurant_name ?? "")
  );

  const hotelId = normalizeParam(params.hotel_id).trim();
  const selectedHotel = hotelId
    ? (
        await getHotels({
          fields: ["id", "hotel_name", "lat", "lng", "city", "country"],
          filter: { id: { _eq: hotelId } },
          limit: 1,
        })
      )[0] ?? null
    : null;

  return (
    <PageShell current="Restaurants">
      <RestaurantsMapView
        city={activeCity}
        cityOptions={cityOptions}
        restaurants={restaurants}
        mapRestaurants={restaurants}
        selectedHotel={
          selectedHotel && selectedHotel.lat != null && selectedHotel.lng != null
            ? {
                id: selectedHotel.id,
                hotel_name: selectedHotel.hotel_name ?? "",
                lat: Number(selectedHotel.lat),
                lng: Number(selectedHotel.lng),
              }
            : null
        }
      />
    </PageShell>
  );
}
