import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type {
  FavoriteHotel,
  FavoriteRestaurant,
  MemberBirthday,
  MemberProfile,
  RoomSelectionEntry,
  SavedTrip,
} from "./types";
import { MAX_TRIP_NAME_CHARS, MAX_TRIPS_PER_MEMBER, TripLimitError } from "./tripLimits";
import { NEW_PASSWORD_RULE } from "./credentials";

/** A trip's period as members read it: "01 Sep 2026 – 10 Sep 2026". Landing
 * and the concierge wrote ISO dates and Hotels wrote these, so one trip list
 * showed both (2026-10-05 test pass). Applied on write and on read, which
 * covers trips already saved the other way. */
export function formatPeriodLabel(label: string | null | undefined): string {
  return (label ?? "").replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) =>
    new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
      new Date(Number(y), Number(m) - 1, Number(d))
    )
  );
}

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

/* THE LOGIN E-MAIL (Ulrik, 2026-10-04).
 *
 * A member has one e-mail, auth.users.email, and it is their login. Personal
 * Information shows it and a change there moves it; member_profiles.email is
 * only a copy, re-synced by the auth callback and on every save.
 *
 * One e-mail, but up to two ways in: a password, and "Continue with Google",
 * which Supabase attaches to the same member when the Google address matches.
 * A change keeps every way in that still works:
 *  - a password member confirms the change with their current password;
 *  - a Google-only member moving to a non-Gmail address sets a password in
 *    the same step, or the new address would have no way to sign in. Moving
 *    to another Gmail address, "Continue with Google" with that account signs
 *    in to this member once the change is confirmed, so a password is
 *    optional. The old Google login stays attached either way. */
type AuthUserLike = {
  email?: string | null;
  new_email?: string | null;
  identities?: { provider: string }[] | null;
  app_metadata?: { providers?: string[] | null } | null;
};

export function signsInWithEmail(user: AuthUserLike): boolean {
  const providers = user.identities?.length
    ? user.identities.map((identity) => identity.provider)
    : user.app_metadata?.providers ?? [];
  return providers.includes("email");
}

export type LoginEmailState = {
  email: string;
  /** An address the member has asked to move to and not yet confirmed. */
  pendingEmail: string | null;
  /** False for a Google-only member, who has no password yet. */
  hasPassword: boolean;
};

export async function fetchLoginEmailStateBrowser(): Promise<LoginEmailState | null> {
  const supabase = createBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    email: user.email ?? "",
    pendingEmail: user.new_email ?? null,
    hasPassword: signsInWithEmail(user),
  };
}

export class EmailChangeError extends Error {}

/* Supabase sends a confirmation link to the NEW address only and changes
 * nothing until it is followed (Ulrik, 2026-10-04): a member changing address
 * may have lost the old inbox. That needs "Secure email change" OFF in the
 * Supabase dashboard - on, it also mails the old address and waits for both.
 * The link lands on the auth callback, which signs the member in on the new
 * address and returns them to Personal Information.
 *
 * With the old inbox out of the loop, the current password is what stops
 * someone at an unattended signed-in screen from moving the account: it is
 * checked first, by signing in with it. A new password (a Google-only member)
 * is set in the same call and works at once; the e-mail waits for the link. */
export async function requestLoginEmailChangeBrowser(
  newEmail: string,
  credentials: { currentPassword?: string; newPassword?: string } = {}
): Promise<void> {
  const supabase = createBrowserClient();

  if (credentials.currentPassword !== undefined) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: checkError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? "",
      password: credentials.currentPassword,
    });
    if (checkError) {
      throw new EmailChangeError(
        checkError.status === 429
          ? "Too many attempts just now. Please try again in a few minutes."
          : "That password is not correct."
      );
    }
  }

  const { error } = await supabase.auth.updateUser(
    credentials.newPassword
      ? { email: newEmail, password: credentials.newPassword }
      : { email: newEmail },
    {
      emailRedirectTo: `${window.location.origin}/auth/callback?next=/members/personal-information`,
    }
  );
  if (!error) return;
  if (error.code === "reauthentication_needed" || error.code === "reauthentication_not_valid") {
    throw new EmailChangeError(
      "For your security, please log out, sign in again with Google and then try again."
    );
  }
  if (error.code === "weak_password") {
    throw new EmailChangeError(NEW_PASSWORD_RULE);
  }
  if (error.code === "email_exists" || /already been registered/i.test(error.message)) {
    throw new EmailChangeError("That e-mail is already used by another account.");
  }
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    throw new EmailChangeError("Too many e-mails sent just now. Please try again in a few minutes.");
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed") {
    throw new EmailChangeError("Please enter a valid e-mail address.");
  }
  throw new EmailChangeError("Could not start the e-mail change.");
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

  const oauthName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";

  return {
    memberName: profile?.member_name ?? oauthName,
    // The login address - see "THE LOGIN E-MAIL".
    email: user.email ?? profile?.email ?? "",
    phone: profile?.phone ?? "",
    homeAirport: profile?.home_airport ?? "",
    birthday: parseBirthday(profile?.birthday ?? null),
    preferredHotelStyle: "",
    preferredAirline: profile?.preferred_airlines?.[0] ?? "",
    marketingEmailsOptIn: profile?.marketing_emails_opt_in ?? false,
    marketingEmailsConsentedAt: profile?.marketing_emails_consented_at ?? null,
    familyMembers: (familyRes.data ?? []).map((member) => ({
      id: member.id,
      fullName: member.full_name ?? "",
      birthday: parseBirthday(member.birthday ?? null),
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
    birthday: serializeBirthday(profile.birthday),
    preferred_currency: null,
    preferred_airlines: profile.preferredAirline
      ? [profile.preferredAirline]
      : [],
    // Consent to service e-mails, with the time it was given. A tick that was
    // already saved keeps its original time; unticking clears both.
    marketing_emails_opt_in: profile.marketingEmailsOptIn,
    marketing_emails_consented_at: profile.marketingEmailsOptIn
      ? profile.marketingEmailsConsentedAt ?? new Date().toISOString()
      : null,
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
      birthday: serializeBirthday(member.birthday),
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
    hotelDirectusId: row.hotel_directus_id,
    name: row.hotel_name ?? "",
    location: row.location ?? "",
    meta: row.meta ?? "",
    thumbnail: row.thumbnail ?? "/images/hero-lp.jpg",
  };
}

function mapFavoriteRestaurant(row: FavoriteRestaurantRow): FavoriteRestaurant {
  return {
    id: row.id,
    restaurantDirectusId: row.restaurant_directus_id,
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

/* The Directus ids of the member's favourite restaurants, for marking them on
 * the Restaurants page. Deliberately separate from
 * fetchFavoriteRestaurantsBrowser: that one maps rows for the Members area and
 * returns the favourite row's own uuid as `id`, which can never be matched
 * against a restaurant. */
export async function fetchFavoriteRestaurantDirectusIdsBrowser(): Promise<
  string[]
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
    .select("restaurant_directus_id")
    .eq("user_id", user.id);

  if (error) throw error;

  return (data ?? [])
    .map((row) => row.restaurant_directus_id)
    .filter((id): id is string => Boolean(id));
}

/* The same for hotels: only the Directus ids, for the favourite star on every
 * hotel card (lib/members/favourites.ts). */
export async function fetchFavoriteHotelDirectusIdsBrowser(): Promise<string[]> {
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
    .select("hotel_directus_id")
    .eq("user_id", user.id);

  if (error) throw error;

  return (data ?? [])
    .map((row) => row.hotel_directus_id)
    .filter((id): id is string | number => id !== null && id !== undefined && id !== "")
    .map(String);
}

/* Writes back a re-checked price ("Update price and availability" in Saved
 * trips). The saved figure is a flat number captured at save time, so a
 * refresh replaces it rather than layering a second, live price beside it. */
export async function updateTripItemPriceBrowser(input: {
  table: "member_trip_hotels" | "member_trip_flights";
  itemId: string;
  priceAmount: number | null;
  priceCurrency: string | null;
}): Promise<void> {
  const supabase = createBrowserClient();

  const { error } = await supabase
    .from(input.table)
    .update({
      price_amount: input.priceAmount,
      price_currency: input.priceCurrency,
    })
    .eq("id", input.itemId);

  if (error) throw error;
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
    period: formatPeriodLabel(trip.period_label),
    travelers: trip.travelers_label ?? "",
    status: trip.status ?? "",
    hotels: hotels
      .filter((item) => item.trip_id === trip.id)
      .map((item) => ({
        id: item.id,
        hotelDirectusId: item.hotel_directus_id,
        name: item.hotel_name ?? "",
        location: item.location ?? "",
        stay: item.stay_label ?? "",
        checkIn: item.check_in ?? undefined,
        checkOut: item.check_out ?? undefined,
        status: (item.status as "confirmed" | "pending" | "saved") ?? "saved",
        thumbnail: item.thumbnail ?? "/images/hero-lp.jpg",
        hasOverlapWarning: item.has_overlap_warning ?? false,
        roomSelection: (item.room_selection as RoomSelectionEntry[] | null) ?? null,
        rooms: item.rooms ?? null,
        adults: item.adults ?? null,
        kids: item.kids ?? null,
        childrenAges: (item.children_ages as number[] | null) ?? null,
        priceAmount: item.price_amount ?? null,
        priceCurrency: item.price_currency ?? null,
      })),
    restaurants: restaurants
      .filter((item) => item.trip_id === trip.id)
      .map((item) => ({
        id: item.id,
        restaurantDirectusId: item.restaurant_directus_id,
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
        departAt: item.depart_at ?? undefined,
        arriveAt: item.arrive_at ?? undefined,
        status: (item.status as "confirmed" | "pending" | "saved") ?? "saved",
        thumbnail: item.thumbnail ?? "/images/hero-lp.jpg",
        destinationArriveAt: item.destination_arrive_at ?? null,
        returnDepartAt: item.return_depart_at ?? null,
        adults: item.adults ?? null,
        kids: item.kids ?? null,
        priceAmount: item.price_amount ?? null,
        priceCurrency: item.price_currency ?? null,
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

export async function submitReviewBrowser(input: {
  reviewType: "hotel" | "restaurant";
  targetLabel: string;
  targetDirectusId?: string | null;
  dateVisited?: string | null;
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
      date_visited: input.dateVisited || null,
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
    const supabase = createBrowserClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { isLoggedIn: false };
    }

    return { isLoggedIn: true };
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
    const parts = [item.destination, formatPeriodLabel(item.period_label)].filter(Boolean);
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

  // The real guard for the per-member trip cap - the pickers also disable
  // their create control, but this is what actually holds when they don't
  // (stale count, second tab, direct call).
  const { count, error: countError } = await supabase
    .from("member_trips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) throw countError;
  if ((count ?? 0) >= MAX_TRIPS_PER_MEMBER) throw new TripLimitError();

  const payload: TripInsert = {
    user_id: user.id,
    name: input?.name?.trim().slice(0, MAX_TRIP_NAME_CHARS) || "New trip",
    destination: input?.destination?.trim() || null,
    period_label: formatPeriodLabel(input?.periodLabel?.trim()) || null,
    travelers_label: input?.travelersLabel?.trim() || null,
    status: "Planning",
  };

  const { data, error } = await supabase
    .from("member_trips")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;

  const parts = [data.destination, formatPeriodLabel(data.period_label)].filter(Boolean);

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
  roomSelection?: RoomSelectionEntry[] | null;
  /** The search behind the price. Omitted when the member saved the hotel
   * without filling in dates, rooms or guests. */
  rooms?: number | null;
  adults?: number | null;
  kids?: number | null;
  childrenAges?: number[] | null;
  /** Total stay price as shown at save time - indicative, not a held rate. */
  priceAmount?: number | null;
  priceCurrency?: string | null;
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
    room_selection: input.roomSelection?.length ? input.roomSelection : null,
    rooms: input.rooms ?? null,
    adults: input.adults ?? null,
    kids: input.kids ?? null,
    children_ages: input.childrenAges?.length ? input.childrenAges : null,
    price_amount: input.priceAmount ?? null,
    price_currency: input.priceCurrency || null,
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

export async function addFlightToTripBrowser(input: {
  tripId?: string | null;
  route: string;
  timing: string;
  cabin: string;
  departAt?: string | null;
  arriveAt?: string | null;
  externalFlightId?: string | null;
  thumbnail?: string | null;
  destinationArriveAt?: string | null;
  returnDepartAt?: string | null;
  adults?: number | null;
  kids?: number | null;
  /** Total itinerary price as shown at save time - indicative, not a held fare. */
  priceAmount?: number | null;
  priceCurrency?: string | null;
}): Promise<{ status: "added" | "already_exists" }> {
  const supabase = createBrowserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) throw new Error("Not authenticated");

  const tripId = input.tripId || (await getOrCreateDefaultTripIdBrowser());

  if (input.externalFlightId) {
    const { data: existing } = await supabase
      .from("member_trip_flights")
      .select("id")
      .eq("user_id", user.id)
      .eq("trip_id", tripId)
      .eq("external_flight_id", input.externalFlightId)
      .maybeSingle();
    if (existing) return { status: "already_exists" };
  }

  const payload: TripFlightInsert = {
    user_id: user.id,
    trip_id: tripId,
    route: input.route || null,
    timing: input.timing || null,
    cabin: input.cabin || null,
    depart_at: input.departAt || null,
    arrive_at: input.arriveAt || null,
    external_flight_id: input.externalFlightId || null,
    status: "saved",
    thumbnail: input.thumbnail || null,
    has_overlap_warning: false,
    destination_arrive_at: input.destinationArriveAt || null,
    return_depart_at: input.returnDepartAt || null,
    adults: input.adults ?? null,
    kids: input.kids ?? null,
    price_amount: input.priceAmount ?? null,
    price_currency: input.priceCurrency || null,
  };

  const { error } = await supabase.from("member_trip_flights").insert(payload);
  if (error) throw error;

  return { status: "added" };
}