import { NextRequest, NextResponse } from "next/server";
import { startFlightSearch } from "@/lib/flights/travelpayoutsClient";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const origin = searchParams.get("origin") || "CPH";
  const destination = searchParams.get("destination") || "JFK";
  const departureDate = searchParams.get("departureDate") || "2026-06-10";

  try {
    const data = await startFlightSearch({
      origin,
      destination,
      departureDate,
      adults: 1,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Flight search failed" }, { status: 500 });
  }
}