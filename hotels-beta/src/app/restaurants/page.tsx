import PageShell from "@/components/site/PageShell";
import RestaurantsMapView from "./ui/RestaurantsMapView";
import { getRestaurantCities, getRestaurantsByCity } from "@/lib/restaurants";
import { expandCityAliases } from "@/lib/locationAliases";
import "./restaurants.css";

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
  const fallbackCity = cityOptions[0] ?? "";

  const activeCity =
    cityOptions.find(
      (option) => option.toLowerCase() === requestedCity.toLowerCase()
    ) ?? fallbackCity;

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
  );

  return (
    <PageShell current="Restaurants">
      <RestaurantsMapView
        city={activeCity}
        cityOptions={cityOptions}
        restaurants={restaurants}
        mapRestaurants={restaurants}
      />
    </PageShell>
  );
}