import "server-only";
import type {
  RatehawkGroupedRoom,
  RatehawkGuestGroup,
  RatehawkHeadline,
  RatehawkRoomImage,
} from "./types";

const RATEHAWK_KEY = process.env.RATEHAWK_KEY?.trim();
const RATEHAWK_KEY_ID = process.env.RATEHAWK_KEY_ID?.trim();
const RATEHAWK_API_URL = (
  process.env.RATEHAWK_API_URL?.trim() || "https://api.ratehawk.com"
).replace(/\/+$/, "");

// This app collects no guest-citizenship field; ETG's residency parameter
// affects pricing/availability for some hotels, so this is a documented
// simplification, not a real per-user value. See CLAUDE.md §30.
const RATEHAWK_DEFAULT_RESIDENCY = "gb";

function assertRatehawkConfig() {
  if (!RATEHAWK_KEY) throw new Error("Missing env RATEHAWK_KEY");
  if (!RATEHAWK_KEY_ID) throw new Error("Missing env RATEHAWK_KEY_ID");
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${RATEHAWK_KEY_ID}:${RATEHAWK_KEY}`).toString("base64");
}

export function buildGuestsArray(
  adults: number,
  kids: number,
  kidAges: number[],
  rooms: number
): RatehawkGuestGroup[] {
  const roomCount = Math.max(1, Math.floor(rooms));
  const totalAdults = Math.max(1, Math.floor(adults));
  const groups: RatehawkGuestGroup[] = Array.from({ length: roomCount }, () => ({
    adults: 0,
    children: [] as number[],
  }));

  for (let i = 0; i < totalAdults; i++) {
    groups[i % roomCount].adults += 1;
  }
  for (const group of groups) {
    if (group.adults < 1) group.adults = 1;
  }

  const kidsCount = Math.max(0, Math.floor(kids));
  for (let i = 0; i < kidsCount; i++) {
    const age = Number.isFinite(kidAges[i]) ? Math.max(0, Math.floor(kidAges[i])) : 10;
    groups[i % roomCount].children.push(age);
  }

  return groups;
}

async function ratehawkPost<T>(path: string, body: unknown): Promise<T> {
  assertRatehawkConfig();

  const response = await fetch(`${RATEHAWK_API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("RATEHAWK RESPONSE STATUS:", response.status);
    console.error("RATEHAWK RESPONSE BODY:", text.slice(0, 2000));
    throw new Error(`Ratehawk request failed (${response.status})`);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

type RawRate = {
  book_hash: string;
  match_hash: string;
  daily_prices?: string[];
  meal_data?: { value?: string; has_breakfast?: boolean };
  payment_options?: {
    payment_types?: { show_amount?: string; show_currency_code?: string }[];
  };
  rg_ext?: {
    capacity?: number;
    bedrooms?: number;
    balcony?: number;
  };
  room_name: string;
  amenities_data?: string[];
  room_data_trans?: {
    bedding_type?: string | null;
    misc_room_type?: string | null;
    beds?: { bed: string; count: number }[];
  };
  cancellation_penalties?: { free_cancellation_before?: string | null };
};

export async function fetchRatehawkHotelpage(input: {
  hid: number;
  checkin: string;
  checkout: string;
  guests: RatehawkGuestGroup[];
  currency: string;
}): Promise<RawRate[]> {
  const json = await ratehawkPost<{
    data?: { hotels?: { rates?: RawRate[] }[] };
  }>("/api/b2b/v3/search/hp/", {
    checkin: input.checkin,
    checkout: input.checkout,
    residency: RATEHAWK_DEFAULT_RESIDENCY,
    language: "en",
    guests: input.guests,
    hid: input.hid,
    currency: input.currency,
  });

  return json.data?.hotels?.[0]?.rates ?? [];
}

type RawRoomGroup = {
  name: string;
  images_ext?: { url: string; category_slug?: string | null }[];
};

export async function fetchRatehawkRoomImages(hid: number): Promise<RawRoomGroup[]> {
  const json = await ratehawkPost<{ data?: { room_groups?: RawRoomGroup[] } }>(
    "/api/b2b/v3/hotel/info/",
    { hid, language: "en" }
  );
  return json.data?.room_groups ?? [];
}

type RawSerpHotel = { hid: number; rates?: RawRate[] };

export async function fetchRatehawkSerpBatch(input: {
  hids: number[];
  checkin: string;
  checkout: string;
  guests: RatehawkGuestGroup[];
  currency: string;
}): Promise<RawSerpHotel[]> {
  const json = await ratehawkPost<{ data?: { hotels?: RawSerpHotel[] } }>(
    "/api/b2b/v3/search/serp/hotels/",
    {
      checkin: input.checkin,
      checkout: input.checkout,
      residency: RATEHAWK_DEFAULT_RESIDENCY,
      language: "en",
      guests: input.guests,
      hids: input.hids,
      currency: input.currency,
    }
  );

  return json.data?.hotels ?? [];
}

// ETG's docs suggest matching a rate to its static-content room group via
// exact rg_ext equality — tested against live data and it does not work
// (rg_ext differs slightly between the search and content endpoints).
// Containment matching on room_name is what actually finds the right room.
// See CLAUDE.md §30.
export function matchRoomImages(
  roomName: string,
  roomGroups: RawRoomGroup[]
): RatehawkRoomImage[] {
  const normalizedRoomName = roomName.toLowerCase();
  let best: RawRoomGroup | null = null;

  for (const group of roomGroups) {
    if (!group.name) continue;
    if (normalizedRoomName.includes(group.name.toLowerCase())) {
      if (!best || group.name.length > best.name.length) best = group;
    }
  }

  if (!best?.images_ext) return [];
  return best.images_ext.map((img) => ({ url: img.url, category: img.category_slug ?? null }));
}

function ratePrice(rate: RawRate): { amount: number; currency: string } | null {
  const paymentType = rate.payment_options?.payment_types?.[0];
  const amount = Number(paymentType?.show_amount);
  if (!paymentType?.show_currency_code || !Number.isFinite(amount)) return null;
  return { amount, currency: paymentType.show_currency_code };
}

// Dedupes rates to one entry per distinct room_name (cheapest rate wins),
// attaches matched images, sorted cheapest-first.
export function groupRoomOptions(
  rates: RawRate[],
  roomGroups: RawRoomGroup[]
): RatehawkGroupedRoom[] {
  const byName = new Map<string, RawRate>();

  for (const rate of rates) {
    const price = ratePrice(rate);
    if (!price) continue;
    const existing = byName.get(rate.room_name);
    if (!existing) {
      byName.set(rate.room_name, rate);
      continue;
    }
    const existingPrice = ratePrice(existing);
    if (existingPrice && price.amount < existingPrice.amount) {
      byName.set(rate.room_name, rate);
    }
  }

  return Array.from(byName.values())
    .map((rate) => {
      const price = ratePrice(rate)!;
      return {
        roomKey: rate.book_hash,
        roomName: rate.room_name,
        bookHash: rate.book_hash,
        matchHash: rate.match_hash,
        pricePerStay: price.amount,
        currency: price.currency,
        dailyPrices: rate.daily_prices ?? [],
        capacity: rate.rg_ext?.capacity || 1,
        bedrooms: rate.rg_ext?.bedrooms ?? 0,
        balcony: Boolean(rate.rg_ext?.balcony),
        bedding: rate.room_data_trans?.bedding_type ?? null,
        beds: rate.room_data_trans?.beds ?? [],
        miscRoomType: rate.room_data_trans?.misc_room_type ?? null,
        mealValue: rate.meal_data?.value ?? "nomeal",
        hasBreakfast: Boolean(rate.meal_data?.has_breakfast),
        freeCancellationBefore: rate.cancellation_penalties?.free_cancellation_before ?? null,
        amenities: rate.amenities_data ?? [],
        sizeSquareMeters: null,
        images: matchRoomImages(rate.room_name, roomGroups),
      };
    })
    .sort((a, b) => a.pricePerStay - b.pricePerStay);
}

// "Book N copies of the cheapest room that fits" — a documented
// simplification, not a true mixed-room-type bin-pack. See CLAUDE.md §30.
export function computeHeadlinePrice(
  groupedRooms: RatehawkGroupedRoom[],
  totalGuests: number,
  rooms: number
): RatehawkHeadline {
  if (!groupedRooms.length) return null;

  const roomCount = Math.max(1, Math.floor(rooms));
  const perRoomGuests = Math.ceil(Math.max(1, totalGuests) / roomCount);

  const qualifying = groupedRooms.filter((room) => room.capacity >= perRoomGuests);
  const pool = qualifying.length > 0 ? qualifying : groupedRooms;
  const cheapest = pool[0];

  return {
    pricePerStay: cheapest.pricePerStay * roomCount,
    currency: cheapest.currency,
    rooms: roomCount,
    roomKey: cheapest.roomKey,
  };
}
