import type {
  FavoriteHotel,
  FavoriteRestaurant,
  MemberProfile,
  MembersData,
  SavedTrip,
} from "./types";

export const DEFAULT_MEMBER_PROFILE: MemberProfile = {
  memberName: "Alex Morgan",
  email: "alex@example.com",
  phone: "+45 12 34 56 78",
  homeAirport: "Copenhagen (CPH)",
  birthday: {
    day: "11",
    month: "Mar",
    year: "1986",
  },
  preferredHotelStyle: "",
  preferredAirline: "SAS",
  familyMembers: [
    {
      id: "fm-1",
      fullName: "Alex Morgan",
      birthday: {
        day: "11",
        month: "Mar",
        year: "1986",
      },
    },
    {
      id: "fm-2",
      fullName: "Emma Morgan",
      birthday: {
        day: "27",
        month: "Sep",
        year: "1988",
      },
    },
  ],
};

export const DEFAULT_TRIPS: SavedTrip[] = [
  {
    id: "france-riviera-september",
    name: "France",
    destination: "French Riviera",
    period: "1 Sep 2026 – 10 Sep 2026",
    travelers: "2 adults",
    status: "Planning",
    hotels: [
      {
        id: "hotel-1",
        name: "Hotel du Cap-Eden-Roc",
        location: "Antibes, France",
        stay: "1 Sep 2026 – 5 Sep 2026",
        status: "saved",
        thumbnail: "/images/hero-lp.jpg",
      },
      {
        id: "hotel-2",
        name: "Cheval Blanc St-Tropez",
        location: "St. Tropez, France",
        stay: "4 Sep 2026 – 10 Sep 2026",
        status: "pending",
        thumbnail: "/images/hero-lp.jpg",
        hasOverlapWarning: true,
      },
    ],
    restaurants: [
      {
        id: "restaurant-1",
        name: "La Vague d'Or",
        location: "St. Tropez, France",
        time: "6 Sep 2026, 20.00",
        status: "saved",
        thumbnail: "/images/hero-lp.jpg",
      },
      {
        id: "restaurant-2",
        name: "JAN",
        location: "Nice, France",
        time: "3 Sep 2026, 19.30",
        status: "pending",
        thumbnail: "/images/hero-lp.jpg",
      },
    ],
    flights: [
      {
        id: "flight-1",
        route: "Copenhagen → Nice",
        timing: "1 Sep 2026 · 09:40–12:05",
        cabin: "Business",
        status: "saved",
        thumbnail: "/images/hero-lp.jpg",
      },
      {
        id: "flight-2",
        route: "Nice → Copenhagen",
        timing: "10 Sep 2026 · 14:10–16:40",
        cabin: "Business",
        status: "saved",
        thumbnail: "/images/hero-lp.jpg",
      },
    ],
  },
];

export const DEFAULT_FAVORITE_HOTELS: FavoriteHotel[] = [
  {
    id: "fav-hotel-1",
    name: "Aman Venice",
    location: "Venice, Italy",
    meta: "Grand Canal · 24 suites · heritage palazzo",
    thumbnail: "/images/hero-lp.jpg",
  },
  {
    id: "fav-hotel-2",
    name: "Passalacqua",
    location: "Lake Como, Italy",
    meta: "Lakeside estate · gardens · private villa feel",
    thumbnail: "/images/hero-lp.jpg",
  },
];

export const DEFAULT_FAVORITE_RESTAURANTS: FavoriteRestaurant[] = [
  {
    id: "fav-restaurant-1",
    name: "Plénitude",
    location: "Paris, France",
    meta: "Fine dining · contemporary French",
    thumbnail: "/images/hero-lp.jpg",
  },
  {
    id: "fav-restaurant-2",
    name: "Le Bernardin",
    location: "New York, USA",
    meta: "Seafood · formal dining",
    thumbnail: "/images/hero-lp.jpg",
  },
];

export const DEFAULT_MEMBERS_DATA: MembersData = {
  profile: DEFAULT_MEMBER_PROFILE,
  trips: DEFAULT_TRIPS,
  favoriteHotels: DEFAULT_FAVORITE_HOTELS,
  favoriteRestaurants: DEFAULT_FAVORITE_RESTAURANTS,
};