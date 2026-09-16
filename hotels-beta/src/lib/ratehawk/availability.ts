import "server-only";
import { getItems } from "@/lib/directus";
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
const RATEHAWK_PROXY_SECRET = process.env.RATEHAWK_PROXY_SECRET?.trim();
const RATEHAWK_API_URL = (
  process.env.RATEHAWK_API_URL?.trim() || "https://api.ratehawk.com"
).replace(/\/+$/, "");

// Two modes, selected purely by which env vars are present (CLAUDE.md §47):
//
//   proxy mode  - RATEHAWK_PROXY_SECRET set. RATEHAWK_API_URL points at the
//                 Railway forwarding proxy, which holds the ETG credentials and
//                 injects the Basic header itself, so deployed environments never
//                 hold the ETG key. This is what gives ETG a fixed set of source
//                 IPs to whitelist, which Vercel's rotating egress cannot.
//   direct mode - no proxy secret. Talks straight to ETG with HTTP Basic, exactly
//                 as before. This is what local dev uses, so local work is never
//                 gated on Railway being up.
//
// The proxy secret is deliberately NOT set on Vercel's Development environment:
// `vercel env pull` writes Development values into .env.local and would silently
// flip local dev into proxy mode.
const USE_PROXY = Boolean(RATEHAWK_PROXY_SECRET);

// ETG's own time budget for a rate search, sent as the `timeout` request
// parameter on /search/serp/*/ and /search/hp/ — 30s is ETG's recommendation
// (§32). When it runs out ETG answers with what it has found so far.
export const ETG_SEARCH_TIMEOUT_S = 30;

// The HTTP timeouts sit above that budget, so ETG answers first rather than the
// connection being cut at the same instant. They must also exceed the proxy's
// own per-path ETG timeouts (etg-proxy/server.js: 40s search, 60s prebook), so
// the proxy always fails first and returns a real status code rather than
// leaving this side holding a dangling socket (§47).
const RATEHAWK_TIMEOUT_MS = 45_000;
export const RATEHAWK_PREBOOK_TIMEOUT_MS = 65_000;

// ETG's documented maximum per Search-by-hotel-IDs request (§32).
const RATEHAWK_SERP_MAX_HIDS = 300;
// Chunks go one at a time. ETG document per-window request counts, not a
// concurrency cap — but they do not rule one out, and the RPM figures we give
// them assume one in-flight search per user action. Chunking only engages
// above 300 hids, so the latency cost lands on whole-country searches alone.
// Raise only if ETG confirm concurrency is not limited.
const SERP_CHUNK_CONCURRENCY = 1;

function assertRatehawkConfig() {
  if (USE_PROXY) return;
  if (!RATEHAWK_KEY) {
    throw new Error("Missing env RATEHAWK_KEY (or RATEHAWK_PROXY_SECRET to route via the ETG proxy)");
  }
  if (!RATEHAWK_KEY_ID) {
    throw new Error("Missing env RATEHAWK_KEY_ID (or RATEHAWK_PROXY_SECRET to route via the ETG proxy)");
  }
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${RATEHAWK_KEY_ID}:${RATEHAWK_KEY}`).toString("base64");
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (USE_PROXY) {
    headers["x-oltra-proxy-secret"] = RATEHAWK_PROXY_SECRET as string;
  } else {
    headers.Authorization = authHeader();
  }

  return headers;
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

  // A missing age is an error, never a default. This used to send 10 for any
  // child without one — a wrong age is a wrong price and a problem at
  // check-in. Callers validate first (guestSelectionIssue), so reaching this
  // throw means a caller skipped that.
  const kidsCount = Math.max(0, Math.floor(kids));
  for (let i = 0; i < kidsCount; i++) {
    if (!Number.isFinite(kidAges[i])) {
      throw new Error(`Missing age for child ${i + 1} of ${kidsCount}`);
    }
    groups[i % roomCount].children.push(Math.max(0, Math.floor(kidAges[i])));
  }

  return groups;
}

export class RatehawkHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`Ratehawk request failed (${status})`);
  }
}

export async function ratehawkPost<T>(
  path: string,
  body: unknown,
  options: { timeoutMs?: number } = {}
): Promise<T> {
  assertRatehawkConfig();

  const response = await fetch(`${RATEHAWK_API_URL}${path}`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs ?? RATEHAWK_TIMEOUT_MS),
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("RATEHAWK RESPONSE STATUS:", response.status);
    console.error("RATEHAWK RESPONSE BODY:", text.slice(0, 2000));
    throw new RatehawkHttpError(response.status, text);
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

export type RawRate = {
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
    timeout: ETG_SEARCH_TIMEOUT_S,
  });

  return json.data?.hotels?.[0]?.rates ?? [];
}

export type RawRoomGroup = {
  name: string;
  rg_ext?: RgExt;
  images_ext?: { url: string; category_slug?: string | null }[];
};

// Shape stored in hotels.ratehawk_room_groups by the offline sync
// (etg-static-sync/sync.js). Trimmed to exactly what RawRoomGroup needs —
// see that file for what was dropped and why.
type StoredRoomGroup = {
  name: string | null;
  rg_ext?: RgExt | null;
  images?: string[] | null;
};

/**
 * Room-group static data for a hotel, read from Directus rather than ETG.
 *
 * This used to be `fetchRatehawkRoomImages()`, which called
 * `/api/b2b/v3/hotel/info/` live on every hotel-detail view. That was two
 * problems at once: ETG grade "static content fetched during a live search" as
 * a certification failure, and `/hotel/info/` is capped at 30 requests / 60s on
 * our key — a site-wide ceiling of 30 hotel-detail views per minute across all
 * users. See CLAUDE.md §32.
 *
 * The matcher downstream is untouched and cannot behave differently: stored
 * `rg_ext` was verified field-by-field identical to `/hotel/info/` across
 * 33,519 of 33,519 room groups.
 *
 * Returns [] for a hotel the sync has not reached yet, or one ETG has no room
 * groups for (24 of 853 legitimately have none). Rooms then render without
 * images — the same behaviour those hotels already had, not a new failure mode.
 */
export async function loadRatehawkRoomGroups(hid: number): Promise<RawRoomGroup[]> {
  const rows = await getItems<{ ratehawk_room_groups?: StoredRoomGroup[] | null }>("hotels", {
    filter: { ratehawk_hid: { _eq: hid } },
    fields: ["ratehawk_room_groups"],
    limit: 1,
  });

  const stored = rows[0]?.ratehawk_room_groups;
  if (!Array.isArray(stored)) return [];

  // The sync stores plain URLs; RawRoomGroup wants ETG's images_ext shape.
  // category_slug is null by design — it was "unspecified" on every room image
  // sampled and is never rendered (hotel-level image categories are separate
  // and unaffected).
  return stored.map((group) => ({
    name: group.name ?? "",
    rg_ext: group.rg_ext ?? undefined,
    images_ext: (group.images ?? []).map((url) => ({ url, category_slug: null })),
  }));
}

export type RawSerpHotel = { hid: number; rates?: RawRate[] };

export async function fetchRatehawkSerpBatch(input: {
  hids: number[];
  checkin: string;
  checkout: string;
  guests: RatehawkGuestGroup[];
  currency: string;
  residency: string;
}): Promise<RawSerpHotel[]> {
  const chunks: number[][] = [];
  for (let i = 0; i < input.hids.length; i += RATEHAWK_SERP_MAX_HIDS) {
    chunks.push(input.hids.slice(i, i + RATEHAWK_SERP_MAX_HIDS));
  }

  const fetchChunk = async (hids: number[]) => {
    const json = await ratehawkPost<{ data?: { hotels?: RawSerpHotel[] } }>(
      "/api/b2b/v3/search/serp/hotels/",
      {
        checkin: input.checkin,
        checkout: input.checkout,
        residency: input.residency,
        language: "en",
        guests: input.guests,
        hids,
        currency: input.currency,
        timeout: ETG_SEARCH_TIMEOUT_S,
      }
    );
    return json.data?.hotels ?? [];
  };

  // Results are concatenated, never matched to a chunk by position: ETG do not
  // return hotels in request order (§48), and every caller joins on `hid`.
  const hotels: RawSerpHotel[] = [];
  for (let i = 0; i < chunks.length; i += SERP_CHUNK_CONCURRENCY) {
    const batch = await Promise.all(chunks.slice(i, i + SERP_CHUNK_CONCURRENCY).map(fetchChunk));
    for (const chunkHotels of batch) hotels.push(...chunkHotels);
  }
  return hotels;
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
  // No static room data to match against (the batch route and Prebook pass
  // none by design) — nothing to look up, and nothing worth warning about.
  if (!roomGroups.length) return [];

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

export function ratePrice(rate: RawRate): { amount: number; currency: string } | null {
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
    .map((rate) => toGroupedRoom(rate, roomGroups))
    .filter((room): room is RatehawkGroupedRoom => room !== null)
    .sort((a, b) => a.pricePerStay - b.pricePerStay);
}

// One ETG rate in the shape the UI reads. Shared by the hotelpage list and the
// Prebook response, so a prebooked rate's price, taxes, meal and cancellation
// terms are read by exactly the same code as the rate it replaced — a change
// the guest is shown can never be an artefact of two parsers disagreeing.
// Null when the rate carries no usable price.
export function toGroupedRoom(rate: RawRate, roomGroups: RawRoomGroup[]): RatehawkGroupedRoom | null {
  const price = ratePrice(rate);
  if (!price) return null;
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
}

// The cheapest room whose per-room capacity fits the party as it is spread
// across the rooms searched.
//
// A rate's price is ALREADY the total for every room in the request's guests
// array — measured live 2026-09-16 (§32): the same rate searched for 2 rooms
// returned exactly 2× its 1-room show_amount and daily_prices, on three real
// Paris hotels. So the price is never multiplied by the room count here. The
// earlier "N copies" formula (§30) did multiply, which overstated every
// multi-room price by a factor of N.
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
    pricePerStay: cheapest.pricePerStay,
    currency: cheapest.currency,
    rooms: roomCount,
    roomKey: cheapest.roomKey,
  };
}
