import type { SavedFlight, SavedFlightSegment, SavedTrip } from "./types";
import { reverseRoute } from "./savedFlights";
import { getTransferTime } from "@/lib/transferTimes";
import { formatPolicyTime } from "@/lib/ratehawk/metapolicy";

/* Turns a SavedTrip into the printed itinerary (layout by Ulrik, 2026-10-06):
 * the trip's places and dates, then one section per date holding that day's
 * flight, the transfer from the airport and the hotel, then RESTAURANTS and
 * MEMBER NOTES. Key facts only - no descriptions - so it reads at a check-in
 * desk. A fact with no value is left out rather than printed as a gap.
 *
 * No long dashes anywhere (Ulrik): ranges take an en dash with spaces, as in
 * "Thu, 12 – 15 Nov 2026", and nothing else needs one. */

export type ItineraryFact = { label: string; value: string };

export type ItineraryEntry = {
  id: string;
  kind: "flight" | "transfer" | "hotel" | "restaurant";
  /** "HH:MM", or "" when unknown or not a timed thing (a transfer). */
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
  /** "Thu, 12 – 15 Nov 2026", or "" when nothing is dated. */
  dates: string;
  days: ItineraryDay[];
  /** Hotels and flights with no usable date - still listed, never dropped. */
  undated: ItineraryEntry[];
  restaurants: ItineraryEntry[];
};

/** What the saved rows do not hold, looked up live by the page (Directus). */
export type ItineraryHotelDetails = {
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

export type ItineraryRestaurantDetails = {
  type?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
};

/** Keyed by the saved item's own id. */
export type ItineraryDetails = {
  hotels: Record<string, ItineraryHotelDetails | undefined>;
  restaurants: Record<string, ItineraryRestaurantDetails | undefined>;
};

const NO_DETAILS: ItineraryDetails = { hotels: {}, restaurants: {} };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
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

/** The wall-clock time as written in the stamp: the airport's own local time. */
function isoTime(value: string | null | undefined): string {
  const match = (value ?? "").match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

/** Pulls a "HH:MM" out of a free-text label like "10 Sept 2026 · 08:30 → 14:00". */
function timeFromLabel(value: string | null | undefined): string {
  const match = (value ?? "").match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday: WEEKDAYS[weekday] ?? "" };
}

/** "Thu, 12 Nov 2026". */
function shortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const { y, m, d, weekday } = parts(iso);
  return `${weekday}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Thursday 12 November 2026" - the day headings. */
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

/** "Thu, 12 – 15 Nov 2026"; the month and year repeat only where they change. */
export function formatDateRange(first: string, last: string): string {
  if (!first) return "";
  if (!last || last === first) return shortDate(first);
  const a = parts(first);
  const b = parts(last);
  const end = `${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y !== b.y) return `${a.weekday}, ${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${end}`;
  if (a.m !== b.m) return `${a.weekday}, ${a.d} ${MONTHS[a.m - 1]} – ${end}`;
  return `${a.weekday}, ${a.d} – ${end}`;
}

function nights(checkIn: string, checkOut: string): number | null {
  if (!checkIn || !checkOut) return null;
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  const n = Math.round(ms / 86_400_000);
  return n > 0 ? n : null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 adults, 1 child (age 8)". */
function partyLabel(adults?: number | null, kids?: number | null, ages?: number[] | null): string {
  const out: string[] = [];
  if (adults) out.push(plural(adults, "adult"));
  if (kids) {
    const known = (ages ?? []).filter((age) => Number.isFinite(age));
    const suffix = known.length ? ` (${known.length === 1 ? "age" : "ages"} ${known.join(", ")})` : "";
    out.push(`${plural(kids, "child", "children")}${suffix}`);
  }
  return out.join(", ");
}

function cabinLabel(cabin: string): string {
  const value = clean(cabin).replace(/_/g, " ").toLowerCase();
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

/** "www.belmond.com" from "https://www.belmond.com/". */
function websiteLabel(url: string | null | undefined): string {
  return clean(url).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** "1 hour 40 minutes", "45 minutes". */
function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return plural(m, "minute");
  return m ? `${plural(h, "hour")} ${plural(m, "minute")}` : plural(h, "hour");
}

/* ------------------------------------------------------------- flights --- */

function airport(name: string, code: string): string {
  const n = clean(name);
  return n && code ? `${n} (${code})` : n || code;
}

function withTerminal(base: string, terminal: string | null): string {
  return terminal ? `${base}, Terminal ${terminal}` : base;
}

/** "SAS SK 1416", segments joined. Duffel's flight number already carries
 * the carrier code on some fares and not on others, so it is shown as given. */
function flightsLabel(segments: SavedFlightSegment[]): string {
  return segments
    .map((s) => [clean(s.airline), clean(s.flightNumber)].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
}

function luggageLabel(segments: SavedFlightSegment[]): string {
  // The journey's allowance is what its tightest segment allows.
  const least = (pick: (s: SavedFlightSegment) => number | null) => {
    const known = segments.map(pick).filter((n): n is number => n !== null);
    return known.length ? Math.min(...known) : null;
  };
  const carryOn = least((s) => s.carryOnBags);
  const checked = least((s) => s.checkedBags);
  const out: string[] = [];
  if (carryOn !== null) out.push(carryOn ? plural(carryOn, "carry-on bag") : "No carry-on bag");
  if (checked !== null) out.push(checked ? plural(checked, "checked bag") : "no checked bag");
  return out.length ? `${out.join(", ")} per passenger` : "";
}

function dayAfter(departIso: string, arriveIso: string): string {
  const a = isoDay(departIso);
  const b = isoDay(arriveIso);
  return a && b && b > a ? ` (${shortDate(b)})` : "";
}

/** One direction of a saved journey, from its stored segments. */
function flightFromSegments(
  id: string,
  segments: SavedFlightSegment[],
  flight: SavedFlight
): ItineraryEntry {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const stops = segments.slice(0, -1).map((s) => airport(s.destinationName, s.destinationCode));
  return {
    id,
    kind: "flight",
    time: isoTime(first.departIso),
    title: `${airport(first.originName, first.originCode)} → ${airport(last.destinationName, last.destinationCode)}`,
    subtitle: "",
    facts: [
      {
        label: "Departure",
        value: withTerminal(`${isoTime(first.departIso)} from ${first.originCode}`, first.originTerminal),
      },
      {
        label: "Arrival",
        value: withTerminal(
          `${isoTime(last.arriveIso)}${dayAfter(first.departIso, last.arriveIso)} at ${last.destinationCode}`,
          last.destinationTerminal
        ),
      },
      { label: segments.length > 1 ? "Flights" : "Flight", value: flightsLabel(segments) },
      { label: "Stops", value: stops.length ? `${plural(stops.length, "stop")}: ${stops.join(", ")}` : "Direct" },
      { label: "Passengers", value: partyLabel(flight.adults, flight.kids) },
      { label: "Cabin", value: cabinLabel(flight.cabin) },
      { label: "Luggage", value: luggageLabel(segments) },
      { label: "Aircraft", value: segments.length === 1 ? clean(first.aircraft) : "" },
    ],
  };
}

type DatedEntry = { date: string; entry: ItineraryEntry };

/** Every flight of a saved row, with where and when it lands. */
function flightEntries(flight: SavedFlight): { dated: DatedEntry[]; arrivals: { date: string; iata: string; name: string }[] } {
  const dated: DatedEntry[] = [];
  const arrivals: { date: string; iata: string; name: string }[] = [];
  const segments = flight.segments;

  if (segments?.outbound.length) {
    const out = flightFromSegments(`flight-${flight.id}`, segments.outbound, flight);
    dated.push({ date: isoDay(segments.outbound[0].departIso), entry: out });
    const last = segments.outbound[segments.outbound.length - 1];
    arrivals.push({ date: isoDay(last.arriveIso), iata: last.destinationCode, name: last.destinationName });
    if (segments.inbound.length) {
      const back = flightFromSegments(`flight-${flight.id}-return`, segments.inbound, flight);
      dated.push({ date: isoDay(segments.inbound[0].departIso), entry: back });
    }
    return { dated, arrivals };
  }

  // Saved before 2026-10-06: the route, times, cabin and party are all there is.
  const shared = [
    { label: "Passengers", value: partyLabel(flight.adults, flight.kids) },
    { label: "Cabin", value: cabinLabel(flight.cabin) },
  ];
  dated.push({
    date: isoDay(flight.departAt) || isoDay(flight.timing),
    entry: {
      id: `flight-${flight.id}`,
      kind: "flight",
      time: isoTime(flight.departAt) || timeFromLabel(flight.timing),
      title: clean(flight.route),
      subtitle: "",
      facts: [{ label: "Departure", value: clean(flight.timing) }, ...shared],
    },
  });
  if (flight.returnDepartAt) {
    dated.push({
      date: isoDay(flight.returnDepartAt),
      entry: {
        id: `flight-${flight.id}-return`,
        kind: "flight",
        time: isoTime(flight.returnDepartAt),
        title: reverseRoute(flight.route),
        subtitle: "",
        facts: [{ label: "Departure", value: isoTime(flight.returnDepartAt) }, ...shared],
      },
    });
  }
  return { dated, arrivals };
}

/* --------------------------------------------------------------- hotels --- */

function roomLabel(hotel: SavedTrip["hotels"][number]): string {
  return (hotel.roomSelection ?? [])
    .map((room) => (room.quantity > 1 ? `${room.quantity} × ${room.roomName}` : room.roomName))
    .join(", ");
}

function guestsLabel(hotel: SavedTrip["hotels"][number]): string {
  const party = partyLabel(hotel.adults, hotel.kids, hotel.childrenAges);
  const rooms = hotel.rooms && hotel.rooms > 1 ? plural(hotel.rooms, "room") : "";
  return [party, rooms].filter(Boolean).join(", ");
}

function hotelEntry(hotel: SavedTrip["hotels"][number], details: ItineraryHotelDetails): ItineraryEntry {
  const checkIn = isoDay(hotel.checkIn);
  const checkOut = isoDay(hotel.checkOut);
  const inTime = formatPolicyTime(details.checkInTime) ?? clean(hotel.checkInTime);
  const outTime = formatPolicyTime(details.checkOutTime) ?? clean(hotel.checkOutTime);
  const stay = nights(checkIn, checkOut);
  return {
    id: `hotel-${hotel.id}`,
    kind: "hotel",
    time: inTime,
    title: clean(hotel.name),
    // No place line under the name, and no website (Ulrik, 2026-10-06).
    subtitle: "",
    facts: [
      { label: "Address", value: clean(details.address ?? hotel.address) },
      { label: "Tel", value: clean(details.phone ?? hotel.phone) },
      { label: "Check-in", value: checkIn ? `${shortDate(checkIn)}${inTime ? `, from ${inTime}` : ""}` : "" },
      { label: "Check-out", value: checkOut ? `${shortDate(checkOut)}${outTime ? `, by ${outTime}` : ""}` : "" },
      { label: "Stay", value: stay ? plural(stay, "night") : clean(hotel.stay) },
      { label: "Room", value: roomLabel(hotel) },
      { label: "Guests", value: guestsLabel(hotel) },
      { label: "Board", value: clean(hotel.boardBasis) },
      { label: "Booking ref", value: clean(hotel.bookingReference) },
    ],
  };
}

/* ---------------------------------------------------------- restaurants --- */

function restaurantEntry(
  restaurant: SavedTrip["restaurants"][number],
  details: ItineraryRestaurantDetails
): ItineraryEntry {
  const date = isoDay(restaurant.reservedAt);
  const time = isoTime(restaurant.reservedAt) || timeFromLabel(restaurant.time);
  return {
    id: `restaurant-${restaurant.id}`,
    kind: "restaurant",
    time,
    title: clean(restaurant.name),
    subtitle: "",
    facts: [
      { label: "Type", value: clean(details.type) },
      { label: "Address", value: clean(details.address ?? restaurant.address) },
      { label: "Website", value: websiteLabel(details.website) },
      { label: "Tel", value: clean(details.phone ?? restaurant.phone) },
      { label: "Reservation", value: date ? `${shortDate(date)}${time ? `, ${time}` : ""}` : clean(restaurant.time) },
      { label: "Party", value: restaurant.partySize ? String(restaurant.partySize) : "" },
      { label: "Booking ref", value: clean(restaurant.bookingReference) },
    ],
  };
}

/* WHERE THE TRIP GOES, from what it holds (2026-10-05). The stored
   destination is whatever the trip was created with, so one started from a
   Costa Smeralda hotel still said Costa Smeralda once it held Paris, London and
   Reykjavik. The places of its hotels and restaurants, in that order, each
   once; flight destinations only when it holds neither, since the airport's
   city is not where the trip goes (Geneva for Courchevel); the stored value
   only when it holds nothing placed. */
function tripPlaces(trip: SavedTrip): string {
  const places: string[] = [];
  const add = (value: string | null | undefined) => {
    const place = (value ?? "").trim();
    if (place && !places.some((p) => p.toLowerCase() === place.toLowerCase())) places.push(place);
  };
  // "Paris · France" -> Paris; "Laugavegur · Reykjavik" -> Reykjavik.
  for (const hotel of trip.hotels) add(hotel.location?.split("·")[0]);
  for (const restaurant of trip.restaurants) add(restaurant.location?.split("·").at(-1));
  for (const flight of places.length ? [] : trip.flights) {
    const to = (flight.route ?? "").split("→")[1];
    // A bare airport code says less than the places already listed.
    if (to && !/^\s*[A-Z]{3}\s*$/.test(to)) add(to);
  }
  return places.join(", ");
}

const KIND_ORDER: Record<ItineraryEntry["kind"], number> = { flight: 0, transfer: 1, hotel: 2, restaurant: 3 };

export function buildTripItinerary(trip: SavedTrip, details: ItineraryDetails = NO_DETAILS): TripItinerary {
  const byDate = new Map<string, ItineraryEntry[]>();
  const undated: ItineraryEntry[] = [];
  const allDates: string[] = [];

  const push = (date: string, entry: ItineraryEntry) => {
    if (!date) {
      undated.push(entry);
      return;
    }
    allDates.push(date);
    const list = byDate.get(date);
    if (list) list.push(entry);
    else byDate.set(date, [entry]);
  };

  const arrivals: { date: string; iata: string; name: string }[] = [];
  for (const flight of trip.flights) {
    const result = flightEntries(flight);
    for (const { date, entry } of result.dated) push(date, entry);
    arrivals.push(...result.arrivals);
  }

  for (const hotel of trip.hotels) {
    const hotelDetails = details.hotels[hotel.id] ?? {};
    const checkIn = isoDay(hotel.checkIn);
    const checkOut = isoDay(hotel.checkOut);
    // The hotel sits on its arrival day; check-out is a line in it, so a day
    // holding only a departure does not get a section of its own.
    push(checkIn || checkOut, hotelEntry(hotel, hotelDetails));
    if (checkOut) allDates.push(checkOut);

    /* THE TRANSFER, when a flight lands the day the stay starts: the drive
       from that airport, as transferTimes.ts measured it for the hotel's
       destination. Train times are not held anywhere, so only the road. */
    const landing = arrivals.find((a) => a.date === checkIn);
    const city = clean(hotelDetails.city);
    const road = landing && city ? getTransferTime(city, landing.iata) : null;
    if (landing && road) {
      push(checkIn, {
        id: `transfer-${hotel.id}`,
        kind: "transfer",
        time: "",
        title: `${durationLabel(road.minutes)} by private transfer from ${airport(landing.name, landing.iata)}`,
        subtitle: "",
        facts: [],
      });
    }
  }

  const restaurants = trip.restaurants
    .map((restaurant) => ({
      date: isoDay(restaurant.reservedAt),
      entry: restaurantEntry(restaurant, details.restaurants[restaurant.id] ?? {}),
    }))
    // Reserved ones first, by date and time; the rest as saved.
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.entry.time.localeCompare(b.entry.time))
    .map(({ entry }) => entry);

  const days: ItineraryDay[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({
      date,
      heading: dayHeading(date),
      // Flight, then the transfer from it, then the hotel (Ulrik); flights
      // among themselves by departure time.
      entries: [...entries].sort(
        (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.time.localeCompare(b.time)
      ),
    }));

  const sortedDates = [...new Set(allDates)].sort();

  return dropEmptyFacts({
    tripName: trip.name || "Trip",
    destination: tripPlaces(trip) || trip.destination,
    dates: formatDateRange(sortedDates[0] ?? "", sortedDates.at(-1) ?? ""),
    days,
    undated,
    restaurants,
  });
}

/* A fact with no answer yet is not shown: almost nothing beyond the booking
   basics exists until a trip is booked, and rows of blanks buried the real
   values. Applied once so the document and the mail body stay identical. */
function dropEmptyFacts(itinerary: TripItinerary): TripItinerary {
  const clean = (entries: ItineraryEntry[]) =>
    entries.map((entry) => ({ ...entry, facts: entry.facts.filter((fact) => fact.value.trim()) }));
  return {
    ...itinerary,
    days: itinerary.days.map((day) => ({ ...day, entries: clean(day.entries) })),
    undated: clean(itinerary.undated),
    restaurants: clean(itinerary.restaurants),
  };
}

export const KIND_LABEL: Record<ItineraryEntry["kind"], string> = {
  flight: "Flight",
  transfer: "Transfer",
  hotel: "Hotel",
  restaurant: "",
};

/** Plain-text rendering, used for the "Send" mail body. */
export function itineraryToPlainText(itinerary: TripItinerary, notes = ""): string {
  const lines: string[] = ["myOLTRA ITINERARY", "", itinerary.tripName];
  const meta = [itinerary.destination, itinerary.dates].filter(Boolean).join(" – ");
  if (meta) lines.push(meta);

  const section = (heading: string, entries: ItineraryEntry[]) => {
    lines.push("", heading.toUpperCase(), "_".repeat(Math.min(heading.length, 40)));
    for (const entry of entries) {
      lines.push("");
      const label = KIND_LABEL[entry.kind];
      const lead = [label.toUpperCase(), entry.time].filter(Boolean).join(" ");
      lines.push(lead ? `${lead}: ${entry.title}` : entry.title);
      if (entry.subtitle) lines.push(`  ${entry.subtitle}`);
      for (const fact of entry.facts) lines.push(`  ${fact.label}: ${fact.value}`);
    }
  };

  for (const day of itinerary.days) section(day.heading, day.entries);
  if (itinerary.undated.length) section("Not yet dated", itinerary.undated);
  if (itinerary.restaurants.length) section("Restaurants", itinerary.restaurants);
  if (notes.trim()) lines.push("", "MEMBER NOTES", "_".repeat(12), "", notes.trim());

  return lines.join("\n");
}
