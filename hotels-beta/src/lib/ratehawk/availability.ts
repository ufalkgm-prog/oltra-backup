import "server-only";
import type {
  RatehawkCancellationPolicy,
  RatehawkGroupedRoom,
  RatehawkGuestGroup,
  RatehawkHeadline,
  RatehawkRoomImage,
  RatehawkTax,
} from "./types";

const RATEHAWK_KEY = process.env.RATEHAWK_KEY?.trim();
const RATEHAWK_KEY_ID = process.env.RATEHAWK_KEY_ID?.trim();
const RATEHAWK_API_URL = (
  process.env.RATEHAWK_API_URL?.trim() || "https://api.ratehawk.com"
).replace(/\/+$/, "");

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

// Room-characteristics fingerprint present on both /search/hp/ rates and
// /hotel/info/ room_groups[] — ETG's documented, non-deprecated linkage
// between a live rate and its static room data (room_group_id is deprecated,
// see CLAUDE.md §28/§32). Confirmed identical field-by-field on live data via
// scripts/ratehawk/diagnose-rg-ext.mjs (both the ETG test hotel and a real,
// varied hotel, 10/10 rooms) — the two endpoints just serialize the object in
// different key orders, so never compare these via JSON.stringify equality.
type RgExt = {
  class?: number;
  quality?: number;
  sex?: number;
  bathroom?: number;
  bedding?: number;
  family?: number;
  capacity?: number;
  club?: number;
  bedrooms?: number;
  balcony?: number;
  view?: number;
  floor?: number;
};

const RG_EXT_KEYS: (keyof RgExt)[] = [
  "class",
  "quality",
  "sex",
  "bathroom",
  "bedding",
  "family",
  "capacity",
  "club",
  "bedrooms",
  "balcony",
  "view",
  "floor",
];

function rgExtEquals(a: RgExt, b: RgExt): boolean {
  return RG_EXT_KEYS.every((key) => (a[key] ?? null) === (b[key] ?? null));
}

type RawRate = {
  book_hash: string;
  match_hash: string;
  daily_prices?: string[];
  meal_data?: { value?: string; has_breakfast?: boolean };
  payment_options?: {
    payment_types?: RawPaymentType[];
  };
  rg_ext?: RgExt;
  room_name: string;
  amenities_data?: string[];
  room_data_trans?: {
    bedding_type?: string | null;
    misc_room_type?: string | null;
    beds?: { bed: string; count: number }[];
  };
};

// tax_data and cancellation_penalties live on the payment type, not on the
// rate itself — confirmed live via scripts/ratehawk/diagnose-tax-cancellation.mjs
// (see CLAUDE.md §32). An earlier version of this file read
// `rate.cancellation_penalties` directly, which doesn't exist at that path —
// free_cancellation_before silently read as undefined on every rate.
type RawPaymentType = {
  amount?: string;
  show_amount?: string;
  currency_code?: string;
  show_currency_code?: string;
  tax_data?: {
    taxes?: {
      name?: string;
      included_by_supplier?: boolean;
      amount?: string;
      currency_code?: string;
    }[];
  };
  cancellation_penalties?: {
    policies?: {
      start_at?: string | null;
      end_at?: string | null;
      amount_show?: string;
    }[];
    free_cancellation_before?: string | null;
  };
};

export async function fetchRatehawkHotelpage(input: {
  hid: number;
  checkin: string;
  checkout: string;
  guests: RatehawkGuestGroup[];
  currency: string;
  residency: string;
}): Promise<RawRate[]> {
  const json = await ratehawkPost<{
    data?: { hotels?: { rates?: RawRate[] }[] };
  }>("/api/b2b/v3/search/hp/", {
    checkin: input.checkin,
    checkout: input.checkout,
    residency: input.residency,
    language: "en",
    guests: input.guests,
    hid: input.hid,
    currency: input.currency,
  });

  return json.data?.hotels?.[0]?.rates ?? [];
}

type RawRoomGroup = {
  name: string;
  rg_ext?: RgExt;
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
  residency: string;
}): Promise<RawSerpHotel[]> {
  const json = await ratehawkPost<{ data?: { hotels?: RawSerpHotel[] } }>(
    "/api/b2b/v3/search/serp/hotels/",
    {
      checkin: input.checkin,
      checkout: input.checkout,
      residency: input.residency,
      language: "en",
      guests: input.guests,
      hids: input.hids,
      currency: input.currency,
    }
  );

  return json.data?.hotels ?? [];
}

// Matches a /search/hp/ rate to its static /hotel/info/ room_groups[] entry
// by rg_ext, per ETG's documented linkage (rg_ext, not room_group_id — the
// latter is deprecated, see CLAUDE.md §28/§32). Earlier code here matched on
// room_name containment instead, believing rg_ext comparison didn't work —
// that was a comparison-method bug (JSON.stringify equality on two
// differently-ordered objects, plus a type that never even captured
// group.rg_ext), not a real data mismatch. See CLAUDE.md §32 and
// scripts/ratehawk/diagnose-rg-ext.mjs.
//
// room_name containment is kept only as a fallback for when rg_ext is
// missing from the rate or from every room group — logged when it fires so
// we can tell if that ever actually happens.
function matchRoomGroupByName(roomName: string, roomGroups: RawRoomGroup[]): RawRoomGroup | null {
  const normalizedRoomName = roomName.toLowerCase();
  let best: RawRoomGroup | null = null;

  for (const group of roomGroups) {
    if (!group.name) continue;
    if (normalizedRoomName.includes(group.name.toLowerCase())) {
      if (!best || group.name.length > best.name.length) best = group;
    }
  }

  return best;
}

export function matchRoomImages(rate: RawRate, roomGroups: RawRoomGroup[]): RatehawkRoomImage[] {
  const hasRgExt = Boolean(rate.rg_ext) && roomGroups.some((group) => Boolean(group.rg_ext));

  let best: RawRoomGroup | null = null;
  if (hasRgExt) {
    best = roomGroups.find((group) => group.rg_ext && rgExtEquals(rate.rg_ext!, group.rg_ext)) ?? null;
  } else {
    console.warn(
      `Ratehawk: rg_ext missing on rate "${rate.room_name}" or all room groups — falling back to room_name matching`
    );
    best = matchRoomGroupByName(rate.room_name, roomGroups);
  }

  if (!best?.images_ext) return [];
  return best.images_ext.map((img) => ({ url: img.url, category: img.category_slug ?? null }));
}

// The same payment type must back price, taxes, and cancellation terms for a
// given rate — they're all fields on one object, not independent per-rate
// facts, so every extractor below reads from this single source per rate.
function primaryPaymentType(rate: RawRate): RawPaymentType | undefined {
  return rate.payment_options?.payment_types?.[0];
}

function ratePrice(rate: RawRate): { amount: number; currency: string } | null {
  const paymentType = primaryPaymentType(rate);
  const amount = Number(paymentType?.show_amount);
  if (!paymentType?.show_currency_code || !Number.isFinite(amount)) return null;
  return { amount, currency: paymentType.show_currency_code };
}

// Non-included taxes must never be folded into the displayed price and must
// be shown separately; included ones are already inside show_amount and
// must not be re-added. This returns all of them (both kinds) — callers
// decide how to present includedBySupplier vs not. See CLAUDE.md §32.
function rateTaxes(rate: RawRate): RatehawkTax[] {
  const taxes = primaryPaymentType(rate)?.tax_data?.taxes ?? [];

  return taxes
    .map((tax): RatehawkTax | null => {
      const amount = Number(tax.amount);
      if (!tax.currency_code || !Number.isFinite(amount)) return null;
      return {
        name: tax.name ?? "tax",
        includedBySupplier: Boolean(tax.included_by_supplier),
        amount,
        currency: tax.currency_code,
      };
    })
    .filter((tax): tax is RatehawkTax => tax !== null);
}

// Unmodified copy of ETG's cancellation schedule — never simplified to a
// single before/after date, per CLAUDE.md §32 ("shown unmodified in either
// direction"). startAt/endAt stay as ETG's raw UTC+0 strings; formatting
// (timezone conversion + explicit label) happens at display time.
function rateCancellationPolicies(rate: RawRate): RatehawkCancellationPolicy[] {
  const policies = primaryPaymentType(rate)?.cancellation_penalties?.policies ?? [];

  return policies.map((policy) => ({
    startAt: policy.start_at ?? null,
    endAt: policy.end_at ?? null,
    amountShow: policy.amount_show != null ? Number(policy.amount_show) : null,
  }));
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
        freeCancellationBefore:
          primaryPaymentType(rate)?.cancellation_penalties?.free_cancellation_before ?? null,
        cancellationPolicies: rateCancellationPolicies(rate),
        taxes: rateTaxes(rate),
        amenities: rate.amenities_data ?? [],
        sizeSquareMeters: null,
        images: matchRoomImages(rate, roomGroups),
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
