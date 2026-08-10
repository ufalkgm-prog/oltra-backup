import { NextResponse } from "next/server";
import {
  buildGuestsArray,
  computeHeadlinePrice,
  fetchRatehawkHotelpage,
  fetchRatehawkRoomImages,
  groupRoomOptions,
} from "@/lib/ratehawk/availability";
import { isValidResidencyCode } from "@/lib/countries";

type AvailabilityPayload = {
  hid?: unknown;
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
    const body = (await request.json()) as AvailabilityPayload;

    const hid = Number(body.hid);
    const checkInDate = asString(body.checkInDate);
    const checkOutDate = asString(body.checkOutDate);
    const currency = asString(body.currency) || "EUR";
    const residency = asString(body.residency).toLowerCase();

    if (!Number.isFinite(hid) || hid <= 0) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid Ratehawk hid." },
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

    const [rates, roomGroups] = await Promise.all([
      fetchRatehawkHotelpage({
        hid,
        checkin: checkInDate,
        checkout: checkOutDate,
        guests,
        currency,
        residency,
      }),
      fetchRatehawkRoomImages(hid),
    ]);

    const groupedRooms = groupRoomOptions(rates, roomGroups);
    const headline = computeHeadlinePrice(groupedRooms, adults + kids, rooms);

    return NextResponse.json({
      ok: true,
      rooms: groupedRooms,
      headline,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("RATEHAWK AVAILABILITY ERROR:", error);

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
