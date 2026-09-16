export type RatehawkGuestGroup = { adults: number; children: number[] };

export type RatehawkRoomImage = { url: string; category: string | null };

// One entry per tax_data.taxes[] item on the rate's primary payment type.
// currency is that entry's own currency_code — not-included taxes are
// typically in the supplier's local currency (paid at the hotel),
// included ones typically match the display currency. See CLAUDE.md §32.
export type RatehawkTax = {
  name: string;
  includedBySupplier: boolean;
  amount: number;
  currency: string;
};

// One entry per cancellation_penalties.policies[] item, unmodified from
// ETG (never simplified to look more/less flexible than what they sent).
// startAt/endAt are ETG's raw UTC+0 timestamps with no offset marker —
// callers must treat them as UTC and label the conversion, never pass them
// straight to `new Date()` (a bare "no offset" ISO string parses as local
// time per the JS spec, which is wrong here). amountShow is in the rate's
// display currency, matching how price is always shown elsewhere.
export type RatehawkCancellationPolicy = {
  startAt: string | null;
  endAt: string | null;
  amountShow: number | null;
};

export type RatehawkGroupedRoom = {
  roomKey: string;
  roomName: string;
  bookHash: string;
  matchHash: string;
  // The whole stay for EVERY room searched, not one room — ETG price a rate
  // for the full guests array (§32, measured 2026-09-16). Never multiply it
  // by the room count.
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
  cancellationPolicies: RatehawkCancellationPolicy[];
  taxes: RatehawkTax[];
  amenities: string[];
  // Room area in m² — feature-gated on ETG's side (requires a supplementary
  // account agreement); confirmed null for this account, see CLAUDE.md §30.
  sizeSquareMeters: number | null;
  images: RatehawkRoomImage[];
};

export type RatehawkHeadline = {
  // Total for all `rooms`, as priced by ETG — see RatehawkGroupedRoom.
  pricePerStay: number;
  currency: string;
  // The number of rooms that price covers. Informational, not a multiplier.
  rooms: number;
  roomKey: string;
} | null;
