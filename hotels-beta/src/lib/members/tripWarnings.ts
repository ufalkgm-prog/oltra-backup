import type { SavedTrip } from "./types";

/* Soft consistency checks across a saved trip's hotels and flights.
 *
 * These never block anything - a member is allowed to save an incoherent trip,
 * and often will while still planning. They only point out the combinations
 * that are almost certainly a mistake: a double-booked night, a flight that
 * lands after the room starts, a party size that does not match, a night with
 * nowhere to sleep.
 *
 * Cross-referencing only runs when the trip has BOTH hotels and flights.
 * A hotels-only or flights-only trip is not incomplete, it is half-planned,
 * and warning about the missing half would fire on almost every new trip. */

export type TripWarning = {
  id: string;
  message: string;
};

/** A wall-clock date and time as written at the airport, not converted. */
type LocalStamp = { date: string; minutes: number };

/* Duffel timestamps carry the local offset (see CLAUDE.md §7B), so the date
 * and time are read straight off the string. Converting to the browser's zone
 * would ask "what time was it in Copenhagen when the flight landed in Tokyo",
 * which is the wrong question for "did I land after check-in". */
function parseLocalStamp(iso?: string | null): LocalStamp | null {
  if (!iso) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return null;
  return {
    date: match[1],
    minutes: Number(match[2]) * 60 + Number(match[3]),
  };
}

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayDiff(later: string, earlier: string): number {
  return Math.round((toUtcMs(later) - toUtcMs(earlier)) / DAY_MS);
}

function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** An arrival before this hour reads as an overnight flight rather than a
 * genuinely lost first night. */
const EARLY_ARRIVAL_CUTOFF_MINUTES = 9 * 60;

export function buildTripWarnings(trip: SavedTrip): TripWarning[] {
  const warnings: TripWarning[] = [];

  const datedHotels = trip.hotels
    .filter((hotel) => hotel.checkIn && hotel.checkOut)
    .map((hotel) => ({
      ...hotel,
      checkIn: hotel.checkIn as string,
      checkOut: hotel.checkOut as string,
    }))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  // 1. Two hotels booked over the same night. A checkout on the same day as
  //    the next checkin is a normal hand-over, not an overlap - stays are
  //    half-open [checkIn, checkOut).
  for (let i = 0; i < datedHotels.length; i += 1) {
    for (let j = i + 1; j < datedHotels.length; j += 1) {
      const a = datedHotels[i];
      const b = datedHotels[j];
      if (a.checkIn < b.checkOut && b.checkIn < a.checkOut) {
        warnings.push({
          id: `hotel-overlap-${a.id}-${b.id}`,
          message: `${a.name} (${formatDay(a.checkIn)} – ${formatDay(
            a.checkOut
          )}) and ${b.name} (${formatDay(b.checkIn)} – ${formatDay(
            b.checkOut
          )}) overlap. You are booked into two hotels on the same night.`,
        });
      }
    }
  }

  // Everything below compares the two halves against each other.
  if (!trip.hotels.length || !trip.flights.length) return warnings;

  // The outbound is the earliest departure; a return trip is a single saved
  // row, so this is normally the only flight.
  const outbound = [...trip.flights]
    .filter((flight) => flight.departAt)
    .sort((a, b) => (a.departAt ?? "").localeCompare(b.departAt ?? ""))[0];

  if (!outbound) return warnings;

  const arrival = parseLocalStamp(
    outbound.destinationArriveAt ?? outbound.arriveAt
  );
  const firstHotel = datedHotels[0];

  // 2. The flight does not land on the day the first room starts.
  if (arrival && firstHotel) {
    const gap = dayDiff(arrival.date, firstHotel.checkIn);

    if (gap === 1 && arrival.minutes >= EARLY_ARRIVAL_CUTOFF_MINUTES) {
      warnings.push({
        id: `arrival-after-checkin-${outbound.id}`,
        message: `Your flight lands ${formatDay(arrival.date)} at ${formatTime(
          arrival.minutes
        )}, the day after ${firstHotel.name} starts (${formatDay(
          firstHotel.checkIn
        )}). You would be paying for a night you cannot use.`,
      });
    } else if (gap > 0) {
      warnings.push({
        id: `arrival-after-checkin-${outbound.id}`,
        message: `Your flight lands ${formatDay(
          arrival.date
        )}, but ${firstHotel.name} starts ${formatDay(
          firstHotel.checkIn
        )} — ${plural(gap, "night", "nights")} earlier.`,
      });
    } else if (gap < 0) {
      warnings.push({
        id: `arrival-before-checkin-${outbound.id}`,
        message: `Your flight lands ${formatDay(
          arrival.date
        )}, but your first hotel only starts ${formatDay(
          firstHotel.checkIn
        )} — you have nowhere to stay for ${plural(
          Math.abs(gap),
          "night",
          "nights"
        )}.`,
      });
    }
  }

  // 3. The flight and a hotel are booked for different numbers of people.
  const flightParty =
    outbound.adults != null ? outbound.adults + (outbound.kids ?? 0) : null;

  if (flightParty != null) {
    const mismatched = trip.hotels.filter((hotel) => {
      if (hotel.adults == null) return false;
      return hotel.adults + (hotel.kids ?? 0) !== flightParty;
    });

    if (mismatched.length) {
      const detail = mismatched
        .map(
          (hotel) =>
            `${hotel.name} (${plural(
              (hotel.adults ?? 0) + (hotel.kids ?? 0),
              "guest",
              "guests"
            )})`
        )
        .join(", ");
      warnings.push({
        id: "party-size-mismatch",
        message: `Your flight is booked for ${plural(
          flightParty,
          "traveller",
          "travellers"
        )}, but ${detail} ${
          mismatched.length === 1 ? "does" : "do"
        } not match.`,
      });
    }
  }

  // 4. Nights inside the flight-implied stay with no room booked. Needs a
  //    return leg - a one-way says nothing about when the stay ends.
  const departureHome = parseLocalStamp(outbound.returnDepartAt);

  if (arrival && departureHome && datedHotels.length) {
    const covered = new Set<string>();
    for (const hotel of datedHotels) {
      for (
        let night = hotel.checkIn;
        night < hotel.checkOut;
        night = addDays(night, 1)
      ) {
        covered.add(night);
      }
    }

    const uncovered: string[] = [];
    for (
      let night = arrival.date;
      night < departureHome.date;
      night = addDays(night, 1)
    ) {
      if (!covered.has(night)) uncovered.push(night);
    }

    if (uncovered.length) {
      const range =
        uncovered.length === 1
          ? formatDay(uncovered[0])
          : `${formatDay(uncovered[0])} – ${formatDay(
              uncovered[uncovered.length - 1]
            )}`;
      warnings.push({
        id: "uncovered-nights",
        message: `No hotel is saved for ${plural(
          uncovered.length,
          "night",
          "nights"
        )} of your trip (${range}).`,
      });
    }
  }

  return warnings;
}
