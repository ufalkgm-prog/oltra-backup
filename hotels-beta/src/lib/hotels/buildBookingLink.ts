export type BookingProvider = "booking" | "cj_booking" | "official" | "none" | null;

export type BookableHotel = {
  booking_provider?: BookingProvider;
  booking_url?: string | null;
  booking_hotel_ref?: string | null;
  booking_enabled?: boolean | null;
  booking_label?: string | null;
  booking_notes?: string | null;
  official_website_booking_url?: string | null;
  www?: string | null;
};

export type BookingSearchParams = {
  from?: string | null;
  to?: string | null;
  adults?: string | number | null;
  kids?: string | number | null;
  bedrooms?: string | number | null;
};

function normalizeBookingProvider(provider: BookingProvider): BookingProvider {
  return provider ?? "none";
}

function isValidDateString(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toPositiveInt(
  value: string | number | null | undefined,
  fallback: number
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;

  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  return rounded > 0 ? rounded : fallback;
}

function toNonNegativeInt(
  value: string | number | null | undefined,
  fallback = 0
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;

  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  return rounded >= 0 ? rounded : fallback;
}

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function applyBookingOccupancyParams(
  url: URL,
  params?: BookingSearchParams
): URL {
  if (!params) return url;

  const from = isValidDateString(params.from ?? null) ? String(params.from) : "";
  const to = isValidDateString(params.to ?? null) ? String(params.to) : "";
  const adults = toPositiveInt(params.adults, 2);
  const kids = toNonNegativeInt(params.kids, 0);
  const rooms = toPositiveInt(params.bedrooms, 1);

  if (from) url.searchParams.set("checkin", from);
  if (to) url.searchParams.set("checkout", to);

  url.searchParams.set("group_adults", String(adults));
  url.searchParams.set("group_children", String(kids));
  url.searchParams.set("no_rooms", String(rooms));

  return url;
}

export function buildBookingLink(
  hotel: BookableHotel,
  params?: BookingSearchParams
): string | null {
  if (hotel.booking_enabled === false) return null;

  const provider = normalizeBookingProvider(hotel.booking_provider);
  if (provider === "none") return null;

  if (provider === "official") {
    const raw =
      hotel.official_website_booking_url ?? hotel.booking_url ?? hotel.www ?? null;

    if (!raw) return null;

    const url = tryParseUrl(raw);
    if (!url) return raw;

    return applyBookingOccupancyParams(url, params).toString();
  }

  if (!hotel.booking_url) return null;

  if (provider === "booking") {
    const url = tryParseUrl(hotel.booking_url);
    if (!url) return hotel.booking_url;

    applyBookingOccupancyParams(url, params);

    const aid = process.env.NEXT_PUBLIC_BOOKING_AID;
    if (aid) {
      url.searchParams.set("aid", aid);
    }

    if (hotel.booking_hotel_ref?.trim()) {
      url.searchParams.set("hotel_id", hotel.booking_hotel_ref.trim());
    }

    return url.toString();
  }

  if (provider === "cj_booking") {
    const baseUrl = tryParseUrl(hotel.booking_url);
    const finalTarget = baseUrl
      ? applyBookingOccupancyParams(baseUrl, params).toString()
      : hotel.booking_url;

    const cjPid = process.env.NEXT_PUBLIC_CJ_PID;
    const cjLinkId = process.env.NEXT_PUBLIC_CJ_LINK_ID;

    if (!cjPid || !cjLinkId) {
      return finalTarget;
    }

    return `https://www.anrdoezrs.net/click-${cjPid}-${cjLinkId}?url=${encodeURIComponent(
      finalTarget
    )}`;
  }

  return null;
}