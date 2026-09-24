import "server-only";
import type { createClient } from "@/lib/supabase/server";

/* THE MEMBER'S OWN FAVOURITES AND SAVED TRIPS, READ-ONLY (Ulrik, 2026-09-24).
 *
 * The concierge could see none of it: "which of my favourites have rooms in
 * June" and "plan a weekend around my favourite hotels" were answered with a
 * fixed account reply, or with the favourites silently dropped. These readers
 * run in the chat route with the member's own session, so row-level security
 * and the user_id filter both confine them to the signed-in member.
 *
 * Read only. Nothing here writes, and the concierge still adds and removes
 * nothing: that stays with the site's ADD TO FAVOURITES and SAVE TO TRIP
 * buttons.
 *
 * NO PRICES, structurally. Saved trip hotels and flights store the price the
 * member saw (`price_amount`); the columns are listed explicitly so it is never
 * read, and the model cannot quote a figure it was never given (§50). */

/** The chat route's own server client, carrying the member's session. */
type Client = Awaited<ReturnType<typeof createClient>>;

export type MemberFavourites = {
  hotels: { id: number | null; name: string; location: string }[];
  restaurants: { id: number | null; name: string; location: string }[];
};

export type MemberSavedTrip = {
  name: string;
  destination: string;
  period: string;
  travellers: string;
  hotels: {
    id: number | null;
    name: string;
    location: string;
    checkIn: string;
    checkOut: string;
    adults: number | null;
    kids: number | null;
    rooms: number | null;
  }[];
  restaurants: { id: number | null; name: string; location: string; reservation: string }[];
  flights: { route: string; departAt: string; returnDepartAt: string; cabin: string; timing: string }[];
};

const text = (value: string | null | undefined) => (value ?? "").trim();
/** The Directus id, or null for an older row that saved a name-based
 * reference instead: a 0 would read to the model as a real hotel. */
const idOf = (value: string | null | undefined): number | null => {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : null;
};

export async function readMemberFavourites(supabase: Client, userId: string): Promise<MemberFavourites> {
  const [hotels, restaurants] = await Promise.all([
    supabase
      .from("member_favorite_hotels")
      .select("hotel_directus_id, hotel_name, location")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("member_favorite_restaurants")
      .select("restaurant_directus_id, restaurant_name, location")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);
  if (hotels.error) throw hotels.error;
  if (restaurants.error) throw restaurants.error;
  return {
    hotels: (hotels.data ?? []).map((row) => ({
      id: idOf(row.hotel_directus_id),
      name: text(row.hotel_name),
      location: text(row.location),
    })),
    restaurants: (restaurants.data ?? []).map((row) => ({
      id: idOf(row.restaurant_directus_id),
      name: text(row.restaurant_name),
      location: text(row.location),
    })),
  };
}

export async function readMemberSavedTrips(supabase: Client, userId: string): Promise<MemberSavedTrip[]> {
  const [trips, hotels, restaurants, flights] = await Promise.all([
    supabase
      .from("member_trips")
      .select("id, name, destination, period_label, travelers_label")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("member_trip_hotels")
      .select("trip_id, hotel_directus_id, hotel_name, location, check_in, check_out, adults, kids, rooms")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("member_trip_restaurants")
      .select("trip_id, restaurant_directus_id, restaurant_name, location, reservation_label")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("member_trip_flights")
      .select("trip_id, route, depart_at, return_depart_at, cabin, timing")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);
  for (const res of [trips, hotels, restaurants, flights]) if (res.error) throw res.error;

  return (trips.data ?? []).map((trip) => ({
    name: text(trip.name),
    destination: text(trip.destination),
    period: text(trip.period_label),
    travellers: text(trip.travelers_label),
    hotels: (hotels.data ?? [])
      .filter((row) => row.trip_id === trip.id)
      .map((row) => ({
        id: idOf(row.hotel_directus_id),
        name: text(row.hotel_name),
        location: text(row.location),
        checkIn: text(row.check_in),
        checkOut: text(row.check_out),
        adults: row.adults,
        kids: row.kids,
        rooms: row.rooms,
      })),
    restaurants: (restaurants.data ?? [])
      .filter((row) => row.trip_id === trip.id)
      .map((row) => ({
        id: idOf(row.restaurant_directus_id),
        name: text(row.restaurant_name),
        location: text(row.location),
        reservation: text(row.reservation_label),
      })),
    flights: (flights.data ?? [])
      .filter((row) => row.trip_id === trip.id)
      .map((row) => ({
        route: text(row.route),
        departAt: text(row.depart_at),
        returnDepartAt: text(row.return_depart_at),
        cabin: text(row.cabin),
        timing: text(row.timing),
      })),
  }));
}
