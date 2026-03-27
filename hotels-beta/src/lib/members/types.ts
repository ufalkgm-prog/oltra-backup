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
    passportNumber: string;
    passportExpiry: string;
  }>;
};

export type SavedHotel = {
  id: string;
  name: string;
  location: string;
  stay: string;
  status: "confirmed" | "pending" | "saved";
  thumbnail: string;
  hasOverlapWarning?: boolean;
};

export type SavedRestaurant = {
  id: string;
  name: string;
  location: string;
  time: string;
  status: "confirmed" | "pending" | "saved";
  thumbnail: string;
  hasOverlapWarning?: boolean;
};

export type SavedFlight = {
  id: string;
  route: string;
  timing: string;
  cabin: string;
  status: "confirmed" | "pending" | "saved";
  thumbnail: string;
  hasOverlapWarning?: boolean;
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