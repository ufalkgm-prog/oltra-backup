import MembersShell from "../ui/MembersShell";
import ReviewView from "../ui/ReviewView";
import { directusFetchJson } from "@/lib/directus";

type ReviewTargetOption = {
  id: string;
  label: string;
  name: string;
  city?: string | null;
  country?: string | null;
};

type HotelRow = {
  id: string | number;
  hotel_name?: string | null;
  city?: string | null;
  country?: string | null;
};

type RestaurantRow = {
  id: string | number;
  restaurant_name?: string | null;
  city?: string | null;
  country?: string | null;
};

function buildLabel(name: string, city?: string | null, country?: string | null) {
  return [name, city, country].filter(Boolean).join(" · ");
}

async function fetchReviewHotelOptions(): Promise<ReviewTargetOption[]> {
  const params = new URLSearchParams({
    fields: "id,hotel_name,city,country",
    "filter[published][_eq]": "true",
    sort: "hotel_name",
    limit: "-1",
  });

  const rows = await directusFetchJson<HotelRow[]>(
    `/items/hotels?${params.toString()}`
  );

  return (rows ?? [])
    .filter((hotel) => hotel.hotel_name?.trim())
    .map((hotel) => {
      const name = hotel.hotel_name?.trim() ?? "";

      return {
        id: String(hotel.id),
        name,
        city: hotel.city ?? null,
        country: hotel.country ?? null,
        label: buildLabel(name, hotel.city, hotel.country),
      };
    });
}

async function fetchReviewRestaurantOptions(): Promise<ReviewTargetOption[]> {
  const params = new URLSearchParams({
    fields: "id,restaurant_name,city,country",
    "filter[status][_eq]": "published",
    sort: "restaurant_name",
    limit: "-1",
  });

  const rows = await directusFetchJson<RestaurantRow[]>(
    `/items/restaurants?${params.toString()}`
  );

  return (rows ?? [])
    .filter((restaurant) => restaurant.restaurant_name?.trim())
    .map((restaurant) => {
      const name = restaurant.restaurant_name?.trim() ?? "";

      return {
        id: String(restaurant.id),
        name,
        city: restaurant.city ?? null,
        country: restaurant.country ?? null,
        label: buildLabel(name, restaurant.city, restaurant.country),
      };
    });
}

export default async function ReviewPage() {
  const [hotelOptions, restaurantOptions] = await Promise.all([
    fetchReviewHotelOptions(),
    fetchReviewRestaurantOptions(),
  ]);

  return (
    <MembersShell>
      <ReviewView
        hotelOptions={hotelOptions}
        restaurantOptions={restaurantOptions}
      />
    </MembersShell>
  );
}