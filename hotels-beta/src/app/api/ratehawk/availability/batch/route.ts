import { NextResponse } from "next/server";
import {
  buildGuestsArray,
  computeHeadlinePrice,
  fetchRatehawkSerpBatch,
  groupRoomOptions,
} from "@/lib/ratehawk/availability";
import { isValidResidencyCode } from "@/lib/countries";

type BatchAvailabilityPayload = {
  hids?: unknown;
  checkInDate?: unknown;
  checkOutDate?: unknown;
  currency?: unknown;
  residency?: unknown;
  adults?: unknown;
  kids?: unknown;
  childrenAges?: unknown;
  rooms?: unknown;
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
    const body = (await request.json()) as BatchAvailabilityPayload;

    const hids = Array.isArray(body.hids)
      ? body.hids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
      : [];

    const checkInDate = asString(body.checkInDate);
    const checkOutDate = asString(body.checkOutDate);
    const currency = asString(body.currency) || "EUR";
    const residency = asString(body.residency).toLowerCase();

    if (!hids.length) {
      return NextResponse.json(
        { ok: false, error: "Missing Ratehawk hids." },
        { status: 400 }
      );
    }

    if (!isValidResidencyCode(residency)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid residency (passport country)." },
        { status: 400 }
      );
    }

    if (!isIsoDate(checkInDate) || !isIsoDate(checkOutDate)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid stay dates." },
        { status: 400 }
      );
    }

    if (new Date(checkOutDate).getTime() <= new Date(checkInDate).getTime()) {
      return NextResponse.json(
        { ok: false, error: "Check-out must be after check-in." },
        { status: 400 }
      );
    }

    const adults = Math.max(1, asPositiveInt(body.adults, 2));
    const kids = asPositiveInt(body.kids, 0);
    const rooms = Math.max(1, asPositiveInt(body.rooms, 1));

    const childrenAges = Array.isArray(body.childrenAges)
      ? body.childrenAges
          .map((age) => Number(age))
          .filter((age) => Number.isFinite(age))
          .map((age) => Math.max(0, Math.floor(age)))
          .slice(0, kids)
      : [];

    const guests = buildGuestsArray(adults, kids, childrenAges, rooms);

    const hotels = await fetchRatehawkSerpBatch({
      hids,
      checkin: checkInDate,
      checkout: checkOutDate,
      guests,
      currency,
      residency,
    });

    const results = hotels.map((hotel) => {
      const groupedRooms = groupRoomOptions(hotel.rates ?? [], []);
      const headline = computeHeadlinePrice(groupedRooms, adults + kids, rooms);
      return { hid: hotel.hid, headline };
    });

    return NextResponse.json({
      ok: true,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("RATEHAWK BATCH AVAILABILITY ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "development"
            ? message
            : "Could not check Ratehawk availability.",
      },
      { status: 500 }
    );
  }
}
