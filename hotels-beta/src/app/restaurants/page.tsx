import PageShell from "@/components/site/PageShell";
import RestaurantsMapView from "./ui/RestaurantsMapView";
import { getRestaurantCities, getRestaurantsByCity } from "@/lib/restaurants";
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

  const restaurants = activeCity
    ? await getRestaurantsByCity(activeCity)
    : [];

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