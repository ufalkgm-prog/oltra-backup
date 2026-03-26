export type RestaurantRecord = {
  id: number;
  status?: string | null;
  sort?: number | null;
  rank?: number | null;

  restaurant_name: string;
  slug?: string | null;

  description?: string | null;
  highlights?: string | null;
  cuisine?: string | null;

  country?: string | null;
  region?: string | null;
  city?: string | null;
  local_area?: string | null;
  state_province__county__island?: string | null;

  lat: number | null;
  lng: number | null;

  www?: string | null;
  insta?: string | null;

  restaurant_setting?: string | null;
  restaurant_style?: string | null;

  awards?: string[] | null;
  hotel_name_hint?: string | null;
  sources?: string | null;
};