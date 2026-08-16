export type MemberBirthday = {
  day: string;
  month: string;
  year: string;
};

export type MemberProfile = {
  memberName: string;
  email: string;
  phone: string;
  homeAirport: string;
  birthday: MemberBirthday;
  preferredHotelStyle: string;
  preferredAirline: string;
  familyMembers: Array<{
    id: string;
    fullName: string;
    birthday: MemberBirthday;
  }>;
};

export type RoomSelectionEntry = {
  roomName: string;
  quantity: number;
  pricePerStay: number;
  currency: string;
};

/* ---------------------------------------------------------------------------
 * Booking details below are ANTICIPATED, not yet stored.
 *
 * None of these fields has a column in the member_trip_* tables today - hotel
 * and flight booking are not wired (CLAUDE.md §32: the ETG handoff is still
 * blocked) and restaurants have no booking flow at all. They are declared here
 * so the itinerary document can lay out the real thing now and simply start
 * filling in once booking lands; every one of them renders as "To be
 * confirmed" until then.
 *
 * Adding them to the database is deliberately NOT done here: it belongs with
 * the booking work that will actually populate them, so the columns match
 * whatever the provider returns rather than what was guessed months earlier.
 * ------------------------------------------------------------------------- */

export type SavedHotel = {
  id: string;
  name: string;
  location: string;
  stay: string;
  checkIn?: string;
  checkOut?: string;
  status: "confirmed" | "pending" | "saved";
  thumbnail: string;
  hasOverlapWarning?: boolean;
  roomSelection?: RoomSelectionEntry[] | null;
  /** Anticipated - see note above. */
  bookingReference?: string | null;
  address?: string | null;
  phone?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  boardBasis?: string | null;
};

export type SavedRestaurant = {
  id: string;
  name: string;
  location: string;
  time: string;
  status: "confirmed" | "pending" | "saved";
  thumbnail: string;
  hasOverlapWarning?: boolean;
  /** Anticipated - see note above. */
  bookingReference?: string | null;
  address?: string | null;
  phone?: string | null;
  reservedAt?: string | null;
  partySize?: number | null;
};

export type SavedFlight = {
  id: string;
  route: string;
  timing: string;
  cabin: string;
  departAt?: string;
  arriveAt?: string;
  status: "confirmed" | "pending" | "saved";
  thumbnail: string;
  hasOverlapWarning?: boolean;
  /** Anticipated - see note above. */
  bookingReference?: string | null;
  flightNumber?: string | null;
  airline?: string | null;
  departureAirport?: string | null;
  departureTerminal?: string | null;
  arrivalAirport?: string | null;
  arrivalTerminal?: string | null;
  baggageAllowance?: string | null;
  seat?: string | null;
};

export type SavedTrip = {
  id: string;
  name: string;
  destination: string;
  period: string;
  travelers: string;
  status: string;
  hotels: SavedHotel[];
  restaurants: SavedRestaurant[];
  flights: SavedFlight[];
};

export type FavoriteHotel = {
  id: string;
  name: string;
  location: string;
  meta: string;
  thumbnail: string;
};

export type FavoriteRestaurant = {
  id: string;
  name: string;
  location: string;
  meta: string;
  thumbnail: string;
};

export type MembersData = {
  profile: MemberProfile;
  trips: SavedTrip[];
  favoriteHotels: FavoriteHotel[];
  favoriteRestaurants: FavoriteRestaurant[];
};