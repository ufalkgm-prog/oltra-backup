export type RatehawkGuestGroup = { adults: number; children: number[] };

export type RatehawkRoomImage = { url: string; category: string | null };

export type RatehawkGroupedRoom = {
  roomKey: string;
  roomName: string;
  bookHash: string;
  matchHash: string;
  pricePerStay: number;
  currency: string;
  dailyPrices: string[];
  capacity: number;
  bedrooms: number;
  balcony: boolean;
  bedding: string | null;
  beds: { bed: string; count: number }[];
  miscRoomType: string | null;
  mealValue: string;
  hasBreakfast: boolean;
  freeCancellationBefore: string | null;
  amenities: string[];
  // Room area in m² — feature-gated on ETG's side (requires a supplementary
  // account agreement); confirmed null for this account, see CLAUDE.md §30.
  sizeSquareMeters: number | null;
  images: RatehawkRoomImage[];
};

export type RatehawkHeadline = {
  pricePerStay: number;
  currency: string;
  rooms: number;
  roomKey: string;
} | null;
