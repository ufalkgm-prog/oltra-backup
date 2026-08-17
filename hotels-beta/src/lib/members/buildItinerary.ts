import type { SavedTrip } from "./types";

/* Turns a SavedTrip into a day-by-day itinerary: a short summary followed by
 * one block per date. Deliberately key-facts only - no hotel or restaurant
 * descriptions - so the printed document stays something you can read at a
 * check-in desk.
 *
 * Fields that only exist once booking is wired (booking references, flight
 * numbers, terminals, baggage) come through as null and render as "To be
 * confirmed" rather than being hidden, so the document's shape is stable and
 * the gaps are visible. See the note in types.ts. */

export const TBC = "To be confirmed";

export type ItineraryFact = { label: string; value: string };

export type ItineraryEntry = {
  id: string;
  kind: "flight" | "hotel-check-in" | "hotel-check-out" | "hotel-stay" | "restaurant";
  /** Sort key within a day - "HH:MM", or "" when the time is unknown. */
  time: string;
  title: string;
  subtitle: string;
  facts: ItineraryFact[];
};

export type ItineraryDay = {
  /** ISO yyyy-mm-dd. */
  date: string;
  heading: string;
  entries: ItineraryEntry[];
};

export type TripItinerary = {
  tripName: string;
  destination: string;
  period: string;
  travelers: string;
  summaryFacts: ItineraryFact[];
  days: ItineraryDay[];
  /** Items with no usable date - still listed, never silently dropped. */
  unscheduled: ItineraryEntry[];
};

function text(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v || TBC;
}

function isoDay(value: string | null | undefined): string {
  if (!value) return "";
  const raw = value.trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  // Local parts, not toISOString - that shifts across the date line for
  // anyone east of UTC and would file an evening flight under the next day.
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoTime(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

/** Pulls a "HH:MM" out of a free-text label like "10 Sept 2026 · 08:30 → 14:00". */
function timeFromLabel(value: string | null | undefined): string {
  const match = (value ?? "").match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function dayHeading(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function roomSummary(trip: SavedTrip["hotels"][number]): string {
  if (!trip.roomSelection?.length) return TBC;
  return trip.roomSelection
    .map((room) => `${room.quantity}× ${room.roomName}`)
    .join(", ");
}

export function buildTripItinerary(trip: SavedTrip): TripItinerary {
  const byDate = new Map<string, ItineraryEntry[]>();
  const unscheduled: ItineraryEntry[] = [];

  const push = (date: string, entry: ItineraryEntry) => {
    if (!date) {
      unscheduled.push(entry);
      return;
    }
    const list = byDate.get(date);
    if (list) list.push(entry);
    else byDate.set(date, [entry]);
  };

  for (const flight of trip.flights) {
    const date = isoDay(flight.departAt) || isoDay(flight.timing);
    push(date, {
      id: `flight-${flight.id}`,
      kind: "flight",
      time: isoTime(flight.departAt) || timeFromLabel(flight.timing),
      title: flight.route || TBC,
      subtitle: [flight.airline, flight.cabin].filter(Boolean).join(" · ") || flight.cabin,
      facts: [
        { label: "Flight", value: text(flight.flightNumber) },
        { label: "Departs", value: text(flight.timing) },
        { label: "From", value: text(flight.departureAirport) },
        { label: "Departure terminal", value: text(flight.departureTerminal) },
        { label: "To", value: text(flight.arrivalAirport) },
        { label: "Arrival terminal", value: text(flight.arrivalTerminal) },
        { label: "Cabin", value: text(flight.cabin) },
        { label: "Baggage", value: text(flight.baggageAllowance) },
        { label: "Seat", value: text(flight.seat) },
        { label: "Booking ref", value: text(flight.bookingReference) },
      ],
    });
  }

  for (const hotel of trip.hotels) {
    const checkIn = isoDay(hotel.checkIn);
    const checkOut = isoDay(hotel.checkOut);

    const sharedFacts: ItineraryFact[] = [
      { label: "Rooms", value: roomSummary(hotel) },
      { label: "Board", value: text(hotel.boardBasis) },
      { label: "Address", value: text(hotel.address ?? hotel.location) },
      { label: "Phone", value: text(hotel.phone) },
      { label: "Booking ref", value: text(hotel.bookingReference) },
    ];

    // A stay produces two dated entries so it shows up on both the arrival and
    // the departure day, which is what a day-by-day document needs. Falls back
    // to one undated block when neither date is known.
    if (!checkIn && !checkOut) {
      push("", {
        id: `hotel-${hotel.id}`,
        kind: "hotel-stay",
        time: "",
        title: hotel.name || TBC,
        subtitle: hotel.location,
        facts: [{ label: "Stay", value: text(hotel.stay) }, ...sharedFacts],
      });
      continue;
    }

    if (checkIn) {
      push(checkIn, {
        id: `hotel-in-${hotel.id}`,
        kind: "hotel-check-in",
        time: hotel.checkInTime ?? "",
        title: `Check in — ${hotel.name || TBC}`,
        subtitle: hotel.location,
        facts: [
          { label: "Check-in", value: text(hotel.checkInTime) },
          { label: "Stay", value: text(hotel.stay) },
          ...sharedFacts,
        ],
      });
    }

    if (checkOut) {
      push(checkOut, {
        id: `hotel-out-${hotel.id}`,
        kind: "hotel-check-out",
        time: hotel.checkOutTime ?? "",
        title: `Check out — ${hotel.name || TBC}`,
        subtitle: hotel.location,
        facts: [
          { label: "Check-out", value: text(hotel.checkOutTime) },
          { label: "Booking ref", value: text(hotel.bookingReference) },
        ],
      });
    }
  }

  for (const restaurant of trip.restaurants) {
    const date = isoDay(restaurant.reservedAt) || isoDay(restaurant.time);
    push(date, {
      id: `restaurant-${restaurant.id}`,
      kind: "restaurant",
      time: isoTime(restaurant.reservedAt) || timeFromLabel(restaurant.time),
      title: restaurant.name || TBC,
      subtitle: restaurant.location,
      facts: [
        { label: "Reservation", value: text(restaurant.time) },
        { label: "Party size", value: restaurant.partySize ? String(restaurant.partySize) : TBC },
        { label: "Address", value: text(restaurant.address ?? restaurant.location) },
        { label: "Phone", value: text(restaurant.phone) },
        { label: "Booking ref", value: text(restaurant.bookingReference) },
      ],
    });
  }

  const days: ItineraryDay[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({
      date,
      heading: dayHeading(date),
      // Untimed entries sort last within their day rather than jumping to 00:00.
      entries: [...entries].sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      }),
    }));

  const dateRange =
    days.length === 0
      ? text(trip.period)
      : days.length === 1
      ? dayHeading(days[0].date)
      : `${dayHeading(days[0].date)} – ${dayHeading(days[days.length - 1].date)}`;

  return dropUnknownFacts({
    tripName: trip.name || "Trip",
    destination: trip.destination,
    period: trip.period,
    travelers: trip.travelers,
    summaryFacts: [
      { label: "Dates", value: dateRange },
      { label: "Destination", value: text(trip.destination) },
      { label: "Travellers", value: text(trip.travelers) },
      { label: "Flights", value: String(trip.flights.length) },
      { label: "Hotels", value: String(trip.hotels.length) },
      { label: "Restaurants", value: String(trip.restaurants.length) },
    ],
    days,
    unscheduled,
  });
}

/* Strips every fact whose value is still "To be confirmed".
 *
 * Almost nothing beyond the booking basics exists until a trip is actually
 * booked - flight number, terminals, baggage, seat, board basis, phone,
 * booking reference - and printing a row of "To be confirmed" for each one
 * buried the handful of real values in filler. A field that has no answer
 * yet is simply not shown. Applied once here so the printed document and the
 * plain-text mail body stay identical. */
function dropUnknownFacts(itinerary: TripItinerary): TripItinerary {
  const keep = (facts: ItineraryFact[]) =>
    facts.filter((fact) => fact.value && fact.value !== TBC);

  const cleanEntries = (entries: ItineraryEntry[]) =>
    entries.map((entry) => ({ ...entry, facts: keep(entry.facts) }));

  return {
    ...itinerary,
    summaryFacts: keep(itinerary.summaryFacts),
    days: itinerary.days.map((day) => ({
      ...day,
      entries: cleanEntries(day.entries),
    })),
    unscheduled: cleanEntries(itinerary.unscheduled),
  };
}

/** Plain-text rendering, used for the "Send" mail body. */
export function itineraryToPlainText(itinerary: TripItinerary): string {
  const lines: string[] = [];

  lines.push(itinerary.tripName.toUpperCase());
  lines.push("");
  for (const fact of itinerary.summaryFacts) {
    lines.push(`${fact.label}: ${fact.value}`);
  }

  const section = (heading: string, entries: ItineraryEntry[]) => {
    lines.push("");
    lines.push(heading);
    lines.push("-".repeat(heading.length));
    for (const entry of entries) {
      lines.push("");
      lines.push(`${entry.time ? `${entry.time}  ` : ""}${entry.title}`);
      if (entry.subtitle) lines.push(`  ${entry.subtitle}`);
      for (const fact of entry.facts) {
        lines.push(`  ${fact.label}: ${fact.value}`);
      }
    }
  };

  for (const day of itinerary.days) section(day.heading, day.entries);
  if (itinerary.unscheduled.length) section("Not yet scheduled", itinerary.unscheduled);

  return lines.join("\n");
}
