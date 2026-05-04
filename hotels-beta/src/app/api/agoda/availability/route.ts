import { NextResponse } from "next/server";
import { searchAgodaHotelAvailability } from "@/lib/agoda/client";

type AvailabilityPayload = {
  hotelId?: unknown;
  checkInDate?: unknown;
  checkOutDate?: unknown;
  currency?: unknown;
  adults?: unknown;
  kids?: unknown;
  childrenAges?: unknown;
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

    const hotelId = Number(body.hotelId);
    const checkInDate = asString(body.checkInDate);
    const checkOutDate = asString(body.checkOutDate);
    const currency = asString(body.currency) || "EUR";

    if (!Number.isFinite(hotelId) || hotelId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid Agoda hotel ID." },
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

    const childrenAges = Array.isArray(body.childrenAges)
      ? body.childrenAges
          .map((age) => Number(age))
          .filter((age) => Number.isFinite(age))
          .map((age) => Math.max(0, Math.floor(age)))
          .slice(0, kids)
      : [];

    const result = await searchAgodaHotelAvailability({
      hotelId,
      checkInDate,
      checkOutDate,
      currency,
      occupancy: {
        numberOfAdult: adults,
        numberOfChildren: kids,
        ...(kids > 0 && childrenAges.length === kids ? { childrenAges } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("AGODA AVAILABILITY ERROR:", error);

    return NextResponse.json(
      { ok: false, error: "Could not check Agoda availability." },
      { status: 500 }
    );
  }
}