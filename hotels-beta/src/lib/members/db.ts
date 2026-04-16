import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type {
  FavoriteHotel,
  FavoriteRestaurant,
  MemberBirthday,
  MemberProfile,
  SavedTrip,
} from "./types";

type ProfileUpsert = Database["public"]["Tables"]["member_profiles"]["Insert"];
type FamilyInsert =
  Database["public"]["Tables"]["member_family_members"]["Insert"];
type FavoriteHotelRow =
  Database["public"]["Tables"]["member_favorite_hotels"]["Row"];
type FavoriteRestaurantRow =
  Database["public"]["Tables"]["member_favorite_restaurants"]["Row"];
type FavoriteHotelInsert =
  Database["public"]["Tables"]["member_favorite_hotels"]["Insert"];
type FavoriteRestaurantInsert =
  Database["public"]["Tables"]["member_favorite_restaurants"]["Insert"];

type TripRow = Database["public"]["Tables"]["member_trips"]["Row"];
type TripInsert = Database["public"]["Tables"]["member_trips"]["Insert"];
type TripHotelRow = Database["public"]["Tables"]["member_trip_hotels"]["Row"];
type TripHotelInsert =
  Database["public"]["Tables"]["member_trip_hotels"]["Insert"];
type TripRestaurantRow =
  Database["public"]["Tables"]["member_trip_restaurants"]["Row"];
type TripRestaurantInsert =
  Database["public"]["Tables"]["member_trip_restaurants"]["Insert"];
type TripFlightRow = Database["public"]["Tables"]["member_trip_flights"]["Row"];
type TripFlightInsert =
  Database["public"]["Tables"]["member_trip_flights"]["Insert"];

type TripChoice = {
  id: string;
  name: string;
  label: string;
};

type AddRestaurantToTripResult = {
  duplicate: boolean;
  overlapWarning: boolean;
};

type AddFavoriteHotelResult = {
  status: "added" | "already_exists";
};

type AddHotelToTripUiResult = {
  status: "added" | "already_exists";
  overlapWarning: boolean;
};
function parseBirthday(value?: string | null): MemberBirthday {
  if (!value) {
    return { day: "", month: "", year: "" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { day: "", month: "", year: "" };
  }

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return {
    day: String(date.getUTCDate()),
    month: months[date.getUTCMonth()] ?? "",
    year: String(date.getUTCFullYear()),
  };
}

function serializeBirthday(birthday: MemberBirthday): string | null {
  const { day, month, year } = birthday;

  if (!day || !month || !year) return null;

  const monthMap: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };

  const monthNumber = monthMap[month];
  if (!monthNumber) return null;

  const paddedDay = day.padStart(2, "0");
  return `${year}-${monthNumber}-${paddedDay}`;
}

export async function fetchMemberProfileBrowser(): Promise<MemberProfile | null> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const userId = user.id;

  const [profileRes, familyRes] = await Promise.all([
    supabase.from("member_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("member_family_members")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (familyRes.error) throw familyRes.error;

  const profile = profileRes.data;

  return {
    memberName: profile?.member_name ?? "",
    email: profile?.email ?? user.email ?? "",
    phone: profile?.phone ?? "",
    homeAirport: profile?.home_airport ?? "",
    birthday: { day: "", month: "", year: "" },
    preferredHotelStyle:
      profile?.preferred_hotel_styles?.[0] ??
      "",
    preferredAirline:
      profile?.preferred_airlines?.[0] ??
      "",
    familyMembers: (familyRes.data ?? []).map((member) => ({
      id: member.id,
      fullName: member.full_name ?? "",
      birthday: parseBirthday(member.birthday ?? null),
      passportNumber: member.passport_number ?? "",
      passportExpiry: member.passport_expiry ?? "",
    })),
  };
}

export async function saveMemberProfileBrowser(
  profile: MemberProfile
): Promise<void> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const userId = user.id;

  const profilePayload: ProfileUpsert = {
    user_id: userId,
    member_name: profile.memberName || null,
    email: profile.email || null,
    phone: profile.phone || null,
    home_airport: profile.homeAirport || null,
    preferred_currency: null,
    preferred_hotel_styles: profile.preferredHotelStyle
      ? [profile.preferredHotelStyle]
      : [],
    preferred_airlines: profile.preferredAirline
      ? [profile.preferredAirline]
      : [],
  };

  const { error: upsertError } = await supabase
    .from("member_profiles")
    .upsert(profilePayload, { onConflict: "user_id" });

  if (upsertError) throw upsertError;

  const { error: deleteFamilyError } = await supabase
    .from("member_family_members")
    .delete()
    .eq("user_id", userId);

  if (deleteFamilyError) throw deleteFamilyError;

  if (profile.familyMembers.length > 0) {
    const familyPayload: FamilyInsert[] = profile.familyMembers.map((member) => ({
      id: member.id,
      user_id: userId,
      full_name: member.fullName || null,
      passport_number: member.passportNumber || null,
      passport_expiry: member.passportExpiry || null,
    }));

    const { error: insertFamilyError } = await supabase
      .from("member_family_members")
      .insert(familyPayload);

    if (insertFamilyError) throw insertFamilyError;
  }
}

function mapFavoriteHotel(row: FavoriteHotelRow): FavoriteHotel {
  return {
    id: row.id,
    name: row.hotel_name ?? "",
    location: row.location ?? "",
    meta: row.meta ?? "",
    thumbnail: row.thumbnail ?? "/images/hero-lp.jpg",
  };
}

function mapFavoriteRestaurant(row: FavoriteRestaurantRow): FavoriteRestaurant {
  return {
    id: row.id,
    name: row.restaurant_name ?? "",
    location: row.location ?? "",
    meta: row.meta ?? "",
    thumbnail: row.thumbnail ?? "/images/hero-lp.jpg",
  };
}

export async function fetchFavoriteHotelsBrowser(): Promise<FavoriteHotel[]> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("member_favorite_hotels")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(mapFavoriteHotel);
}

export async function fetchFavoriteRestaurantsBrowser(): Promise<
  FavoriteRestaurant[]
> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("member_favorite_restaurants")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(mapFavoriteRestaurant);
}

export async function deleteFavoriteHotelBrowser(id: string): Promise<void> {
  const supabase = createBrowserClient();

  const { error } = await supabase
    .from("member_favorite_hotels")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function deleteFavoriteRestaurantBrowser(id: string): Promise<void> {
  const supabase = createBrowserClient();

  const { error } = await supabase
    .from("member_favorite_restaurants")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function seedFavoriteHotelsIfEmptyBrowser(
  items: FavoriteHotel[]
): Promise<void> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { count, error: countError } = await supabase
    .from("member_favorite_hotels")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) throw countError;
  if ((count ?? 0) > 0 || items.length === 0) return;

  const payload: FavoriteHotelInsert[] = items.map((item, index) => ({
    user_id: user.id,
    hotel_directus_id: `seed-hotel-${index + 1}`,
    hotel_name: item.name || null,
    location: item.location || null,
    meta: item.meta || null,
    thumbnail: item.thumbnail || null,
  }));

  const { error } = await supabase
    .from("member_favorite_hotels")
    .insert(payload);

  if (error) throw error;
}

export async function seedFavoriteRestaurantsIfEmptyBrowser(
  items: FavoriteRestaurant[]
): Promise<void> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { count, error: countError } = await supabase
    .from("member_favorite_restaurants")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) throw countError;
  if ((count ?? 0) > 0 || items.length === 0) return;

  const payload: FavoriteRestaurantInsert[] = items.map((item, index) => ({
    user_id: user.id,
    restaurant_directus_id: `seed-restaurant-${index + 1}`,
    restaurant_name: item.name || null,
    location: item.location || null,
    meta: item.meta || null,
    thumbnail: item.thumbnail || null,
  }));

  const { error } = await supabase
    .from("member_favorite_restaurants")
    .insert(payload);

  if (error) throw error;
}

function mapSavedTrips(
  trips: TripRow[],
  hotels: TripHotelRow[],
  restaurants: TripRestaurantRow[],
  flights: TripFlightRow[]
): SavedTrip[] {
  return trips.map((trip) => ({
    id: trip.id,
    name: trip.name,
    destination: trip.destination ?? "",
    period: trip.period_label ?? "",
    travelers: trip.travelers_label ?? "",
    status: trip.status ?? "",
    hotels: hotels
      .filter((item) => item.trip_id === trip.id)
      .map((item) => ({
        id: item.id,
        name: item.hotel_name ?? "",
        location: item.location ?? "",
        stay: item.stay_label ?? "",
        status: (item.status as "confirmed" | "pending" | "saved") ?? "saved",
        thumbnail: item.thumbnail ?? "/images/hero-lp.jpg",
        hasOverlapWarning: item.has_overlap_warning ?? false,
      })),
    restaurants: restaurants
      .filter((item) => item.trip_id === trip.id)
      .map((item) => ({
        id: item.id,
        name: item.restaurant_name ?? "",
        location: item.location ?? "",
        time: item.reservation_label ?? "",
        status: (item.status as "confirmed" | "pending" | "saved") ?? "saved",
        thumbnail: item.thumbnail ?? "/images/hero-lp.jpg",
        hasOverlapWarning: item.has_overlap_warning ?? false,
      })),
    flights: flights
      .filter((item) => item.trip_id === trip.id)
      .map((item) => ({
        id: item.id,
        route: item.route ?? "",
        timing: item.timing ?? "",
        cabin: item.cabin ?? "",
        status: (item.status as "confirmed" | "pending" | "saved") ?? "saved",
        thumbnail: item.thumbnail ?? "/images/hero-lp.jpg",
        hasOverlapWarning: item.has_overlap_warning ?? false,
      })),
  }));
}

export async function fetchSavedTripsBrowser(): Promise<SavedTrip[]> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const [tripsRes, hotelsRes, restaurantsRes, flightsRes] = await Promise.all([
    supabase
      .from("member_trips")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("member_trip_hotels")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("member_trip_restaurants")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("member_trip_flights")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  if (tripsRes.error) throw tripsRes.error;
  if (hotelsRes.error) throw hotelsRes.error;
  if (restaurantsRes.error) throw restaurantsRes.error;
  if (flightsRes.error) throw flightsRes.error;

  return mapSavedTrips(
    tripsRes.data ?? [],
    hotelsRes.data ?? [],
    restaurantsRes.data ?? [],
    flightsRes.data ?? []
  );
}

export async function deleteSavedTripBrowser(tripId: string): Promise<void> {
  const supabase = createBrowserClient();

  const { error } = await supabase.from("member_trips").delete().eq("id", tripId);

  if (error) throw error;
}

export async function deleteSavedTripItemBrowser(
  table:
    | "member_trip_hotels"
    | "member_trip_restaurants"
    | "member_trip_flights",
  id: string
): Promise<void> {
  const supabase = createBrowserClient();

  const { error } = await supabase.from(table).delete().eq("id", id);

  if (error) throw error;
}

export async function seedSavedTripsIfEmptyBrowser(
  trips: SavedTrip[]
): Promise<void> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { count, error: countError } = await supabase
    .from("member_trips")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) throw countError;
  if ((count ?? 0) > 0 || trips.length === 0) return;

  for (const trip of trips) {
    const tripPayload: TripInsert = {
      user_id: user.id,
      name: trip.name,
      destination: trip.destination || null,
      period_label: trip.period || null,
      travelers_label: trip.travelers || null,
      status: trip.status || null,
    };

    const { data: insertedTrip, error: tripError } = await supabase
      .from("member_trips")
      .insert(tripPayload)
      .select("*")
      .single();

    if (tripError) throw tripError;

    const tripId = insertedTrip.id;

    if (trip.hotels.length > 0) {
      const hotelPayload: TripHotelInsert[] = trip.hotels.map((item, index) => ({
        user_id: user.id,
        trip_id: tripId,
        hotel_directus_id: `seed-trip-hotel-${tripId}-${index + 1}`,
        hotel_name: item.name || null,
        location: item.location || null,
        stay_label: item.stay || null,
        status: item.status || null,
        thumbnail: item.thumbnail || null,
        has_overlap_warning: item.hasOverlapWarning ?? false,
      }));

      const { error } = await supabase
        .from("member_trip_hotels")
        .insert(hotelPayload);

      if (error) throw error;
    }

    if (trip.restaurants.length > 0) {
      const restaurantPayload: TripRestaurantInsert[] = trip.restaurants.map(
        (item, index) => ({
          user_id: user.id,
          trip_id: tripId,
          restaurant_directus_id: `seed-trip-restaurant-${tripId}-${index + 1}`,
          restaurant_name: item.name || null,
          location: item.location || null,
          reservation_label: item.time || null,
          status: item.status || null,
          thumbnail: item.thumbnail || null,
          has_overlap_warning: item.hasOverlapWarning ?? false,
        })
      );

      const { error } = await supabase
        .from("member_trip_restaurants")
        .insert(restaurantPayload);

      if (error) throw error;
    }

    if (trip.flights.length > 0) {
      const flightPayload: TripFlightInsert[] = trip.flights.map((item) => ({
        user_id: user.id,
        trip_id: tripId,
        external_flight_id: null,
        route: item.route || null,
        timing: item.timing || null,
        cabin: item.cabin || null,
        status: item.status || null,
        thumbnail: item.thumbnail || null,
        has_overlap_warning: item.hasOverlapWarning ?? false,
      }));

      const { error } = await supabase
        .from("member_trip_flights")
        .insert(flightPayload);

      if (error) throw error;
    }
  }
}

export async function submitFeedbackSuggestionBrowser(input: {
  topic: string;
  senderEmail: string;
  message: string;
}): Promise<void> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { error } = await supabase
    .from("member_feedback_suggestions")
    .insert({
      user_id: user.id,
      topic: input.topic,
      sender_email: input.senderEmail || user.email || null,
      message: input.message,
    });

  if (error) throw error;
}

export async function submitReviewBrowser(input: {
  reviewType: "hotel" | "restaurant";
  targetLabel: string;
  targetDirectusId?: string | null;
  overallRating: number;
  serviceRating: number;
  designRating: number;
  foodRating: number;
  locationRating: number;
  valueRating: number;
  comments: string;
}): Promise<void> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { error } = await supabase
    .from("member_reviews")
    .insert({
      user_id: user.id,
      review_type: input.reviewType,
      target_directus_id: input.targetDirectusId ?? null,
      target_label: input.targetLabel,
      overall_rating: input.overallRating,
      service_rating: input.serviceRating,
      design_rating: input.designRating,
      food_rating: input.foodRating,
      location_rating: input.locationRating,
      value_rating: input.valueRating,
      comments: input.comments || null,
    });

  if (error) throw error;
}

export async function getMemberActionAccessBrowser(): Promise<{
  isLoggedIn: boolean;
}> {
  try {
    // Reuse the same auth/session source already used by your browser member actions.
    // Example: current Supabase session / current member user lookup.
    // Return true only when a real authenticated member session exists.

    const isLoggedIn = false; // replace with your real auth check
    return { isLoggedIn };
  } catch {
    return { isLoggedIn: false };
  }
}

export async function addFavoriteHotelBrowser(input: {
  hotelDirectusId: string;
  name: string;
  location: string;
  meta: string;
  thumbnail?: string | null;
}): Promise<AddFavoriteHotelResult> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { data: existing, error: existingError } = await supabase
    .from("member_favorite_hotels")
    .select("id")
    .eq("user_id", user.id)
    .eq("hotel_directus_id", input.hotelDirectusId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    return { status: "already_exists" };
  }

  const payload: FavoriteHotelInsert = {
    user_id: user.id,
    hotel_directus_id: input.hotelDirectusId,
    hotel_name: input.name || null,
    location: input.location || null,
    meta: input.meta || null,
    thumbnail: input.thumbnail || null,
  };

  const { error } = await supabase
    .from("member_favorite_hotels")
    .insert(payload);

  if (error) throw error;

  return { status: "added" };
}

export async function addFavoriteRestaurantBrowser(input: {
  restaurantDirectusId: string;
  name: string;
  location: string;
  meta: string;
  thumbnail?: string | null;
}): Promise<void> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const payload: FavoriteRestaurantInsert = {
    user_id: user.id,
    restaurant_directus_id: input.restaurantDirectusId,
    restaurant_name: input.name || null,
    location: input.location || null,
    meta: input.meta || null,
    thumbnail: input.thumbnail || null,
  };

  const { error } = await supabase
    .from("member_favorite_restaurants")
    .upsert(payload, { onConflict: "user_id,restaurant_directus_id" });

  if (error) throw error;
}

export async function fetchTripChoicesBrowser(): Promise<TripChoice[]> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("member_trips")
    .select("id,name,destination,period_label")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((item) => {
    const name = item.name ?? "Untitled trip";
    const parts = [item.destination, item.period_label].filter(Boolean);
    return {
      id: item.id,
      name,
      label: parts.length ? `${name} — ${parts.join(" · ")}` : name,
    };
  });
}

function rangesOverlap(
  startA?: string | null,
  endA?: string | null,
  startB?: string | null,
  endB?: string | null
): boolean {
  if (!startA || !endA || !startB || !endB) return false;

  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();

  if (
    !Number.isFinite(aStart) ||
    !Number.isFinite(aEnd) ||
    !Number.isFinite(bStart) ||
    !Number.isFinite(bEnd)
  ) {
    return false;
  }

  return aStart < bEnd && bStart < aEnd;
}

export async function createTripBrowser(input?: {
  name?: string | null;
  destination?: string | null;
  periodLabel?: string | null;
  travelersLabel?: string | null;
}): Promise<TripChoice> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const payload: TripInsert = {
    user_id: user.id,
    name: input?.name?.trim() || "New trip",
    destination: input?.destination?.trim() || null,
    period_label: input?.periodLabel?.trim() || null,
    travelers_label: input?.travelersLabel?.trim() || null,
    status: "Planning",
  };

  const { data, error } = await supabase
    .from("member_trips")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;

  const parts = [data.destination, data.period_label].filter(Boolean);

  return {
    id: data.id,
    name: data.name ?? "New trip",
    label: parts.length
      ? `${data.name ?? "New trip"} — ${parts.join(" · ")}`
      : data.name ?? "New trip",
  };
}

async function getOrCreateDefaultTripIdBrowser(): Promise<string> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { data: existingTrips, error: tripsError } = await supabase
    .from("member_trips")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (tripsError) throw tripsError;

  if (existingTrips && existingTrips.length > 0) {
    return existingTrips[0].id;
  }

  const tripPayload: TripInsert = {
    user_id: user.id,
    name: "My trip",
    destination: null,
    period_label: null,
    travelers_label: null,
    status: "Planning",
  };

  const { data: insertedTrip, error: insertError } = await supabase
    .from("member_trips")
    .insert(tripPayload)
    .select("*")
    .single();

  if (insertError) throw insertError;

  return insertedTrip.id;
}

export async function addHotelToTripBrowser(input: {
  tripId?: string | null;
  hotelDirectusId: string;
  name: string;
  location: string;
  stayLabel?: string | null;
  thumbnail?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
}): Promise<AddHotelToTripUiResult> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const tripId = input.tripId || (await getOrCreateDefaultTripIdBrowser());

  const { data: existingItems, error: existingError } = await supabase
    .from("member_trip_hotels")
    .select("*")
    .eq("user_id", user.id)
    .eq("trip_id", tripId);

  if (existingError) throw existingError;

  const duplicate = (existingItems ?? []).some(
    (item) => item.hotel_directus_id === input.hotelDirectusId
  );

  if (duplicate) {
    return {
      status: "already_exists",
      overlapWarning: false,
    };
  }

  const overlapWarning = (existingItems ?? []).some((item) =>
    rangesOverlap(item.check_in, item.check_out, input.checkIn, input.checkOut)
  );

  const payload: TripHotelInsert = {
    user_id: user.id,
    trip_id: tripId,
    hotel_directus_id: input.hotelDirectusId,
    hotel_name: input.name || null,
    location: input.location || null,
    stay_label: input.stayLabel || null,
    status: "saved",
    thumbnail: input.thumbnail || null,
    check_in: input.checkIn || null,
    check_out: input.checkOut || null,
    has_overlap_warning: overlapWarning,
  };

  const { error } = await supabase.from("member_trip_hotels").insert(payload);

  if (error) throw error;

  return {
    status: "added",
    overlapWarning,
  };
}

export async function addRestaurantToTripBrowser(input: {
  tripId?: string | null;
  restaurantDirectusId: string;
  name: string;
  location: string;
  reservationLabel?: string | null;
  thumbnail?: string | null;
}): Promise<AddRestaurantToTripResult> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const tripId = input.tripId || (await getOrCreateDefaultTripIdBrowser());

  const { data: existingItems, error: existingError } = await supabase
    .from("member_trip_restaurants")
    .select("*")
    .eq("user_id", user.id)
    .eq("trip_id", tripId);

  if (existingError) throw existingError;

  const duplicate = (existingItems ?? []).some(
    (item) => item.restaurant_directus_id === input.restaurantDirectusId
  );

  if (duplicate) {
    return {
      duplicate: true,
      overlapWarning: false,
    };
  }

  const payload: TripRestaurantInsert = {
    user_id: user.id,
    trip_id: tripId,
    restaurant_directus_id: input.restaurantDirectusId,
    restaurant_name: input.name || null,
    location: input.location || null,
    reservation_label: input.reservationLabel || null,
    status: "saved",
    thumbnail: input.thumbnail || null,
    has_overlap_warning: false,
  };

  const { error } = await supabase
    .from("member_trip_restaurants")
    .insert(payload);

  if (error) throw error;

  return {
    duplicate: false,
    overlapWarning: false,
  };
}