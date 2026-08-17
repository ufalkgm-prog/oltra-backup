import { NextResponse } from "next/server";
import { getItems } from "@/lib/directus";
import {
  buildGuestsArray,
  computeHeadlinePrice,
  fetchRatehawkSerpBatch,
  groupRoomOptions,
} from "@/lib/ratehawk/availability";
import { isValidResidencyCode } from "@/lib/countries";

/* Re-prices one saved trip hotel on demand ("Update price and availability").
 *
 * A saved trip stores the hotel's Directus id, not its Ratehawk hid, and the
 * hid must not be exposed to the browser just to make this call - so the
 * lookup and the Ratehawk request both happen here. Uses the SERP endpoint
 * (one hotel, headline price) rather than the full hotelpage: this only needs
 * the number, not a selectable room list. */

type Payload = {
  hotelDirectusId?: unknown;
  checkInDate?: unknown;
  checkOutDate?: unknown;
  currency?: unknown;
  residency?: unknown;
  adults?: unknown;
  kids?: unknown;
  childrenAges?: unknown;
  rooms?: unknown;
};

type HotelPricingRow = {
  id: string | number;
  ratehawk_hid: number | null;
  ratehawk_status: string | null;
  www: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload;

    const hotelDirectusId = asString(body.hotelDirectusId);
    const checkInDate = asString(body.checkInDate);
    const checkOutDate = asString(body.checkOutDate);
    const currency = asString(body.currency) || "EUR";
    const residency = asString(body.residency).toLowerCase();

    if (!hotelDirectusId) {
      return NextResponse.json(
        { ok: false, error: "Missing hotel id." },
        { status: 400 }
      );
    }

    if (!isValidResidencyCode(residency)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid residency." },
        { status: 400 }
      );
    }

    if (!isIsoDate(checkInDate) || !isIsoDate(checkOutDate)) {
      return NextResponse.json(
        { ok: false, error: "Saved stay dates are missing or invalid." },
        { status: 400 }
      );
    }

    if (new Date(checkOutDate).getTime() <= new Date(checkInDate).getTime()) {
      return NextResponse.json(
        { ok: false, error: "Check-out must be after check-in." },
        { status: 400 }
      );
    }

    const rows = await getItems<HotelPricingRow>("hotels", {
      fields: ["id", "ratehawk_hid", "ratehawk_status", "www"],
      filter: { id: { _eq: hotelDirectusId } },
      limit: 1,
    });

    const hotel = rows[0];
    if (!hotel) {
      return NextResponse.json(
        { ok: false, error: "Hotel not found." },
        { status: 404 }
      );
    }

    // A stored property fact, checked before spending a request: Ratehawk
    // never sells this hotel, so "no availability" would read as sold out
    // (CLAUDE.md §42).
    if (hotel.ratehawk_status === "passive" || !hotel.ratehawk_hid) {
      return NextResponse.json({
        ok: true,
        status: "not_sold",
        websiteUrl: hotel.www ?? null,
      });
    }

    const adults = Math.max(1, asPositiveInt(body.adults, 2));
    const kids = asPositiveInt(body.kids, 0);
    const rooms = Math.max(1, asPositiveInt(body.rooms, 1));

    // Ages matter to the rate: some properties price children differently, and
    // ETG requires an age per child rather than a bare count (CLAUDE.md §32).
    const childrenAges = Array.isArray(body.childrenAges)
      ? body.childrenAges
          .map((age) => Number(age))
          .filter((age) => Number.isFinite(age))
          .map((age) => Math.max(0, Math.floor(age)))
          .slice(0, kids)
      : [];

    const hotels = await fetchRatehawkSerpBatch({
      hids: [hotel.ratehawk_hid],
      checkin: checkInDate,
      checkout: checkOutDate,
      guests: buildGuestsArray(adults, kids, childrenAges, rooms),
      currency,
      residency,
    });

    const grouped = groupRoomOptions(hotels[0]?.rates ?? [], []);
    const headline = computeHeadlinePrice(grouped, adults + kids, rooms);

    if (!headline) {
      return NextResponse.json({ ok: true, status: "unavailable" });
    }

    return NextResponse.json({
      ok: true,
      status: "available",
      priceAmount: headline.pricePerStay,
      priceCurrency: headline.currency,
    });
  } catch (error) {
    console.error("SAVED TRIP HOTEL RE-PRICE ERROR:", error);
    return NextResponse.json(
      { ok: false, error: "Could not check availability." },
      { status: 502 }
    );
  }
}
