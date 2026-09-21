import type { FlightLeg, Itinerary } from './itinerary.ts'

/* WHICH FLIGHT THIS IS, in the words a member needs on Trip.com.
 *
 * The handoff opens a filtered SEARCH, not the flight we recommended - their
 * post-selection URL carries session state that expires and cannot be
 * constructed (spec §4). So the member arrives at a list and has to find the
 * itinerary again, and the only thing that makes that possible is knowing the
 * carrier, the flight numbers and the departure time.
 *
 * WHY THIS IS CODE AND NOT A PROMPT INSTRUCTION. The spec's own remedy is that
 * the concierge's message should name the carrier and flight numbers. Asking
 * the model to remember that makes it a rule it can skip - and §50's record is
 * unambiguous that prompt-only rules of this shape do get skipped, which is why
 * the no-prices guarantee and the broad-set gate were both moved into code. So
 * the flight numbers are rendered from the itinerary, on every handoff, whether
 * the model mentions them or not. The model is not responsible for them and
 * cannot omit them. */

const MONTH_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

export type LegIdentity = {
  /** "CPH → SYD" */
  route: string
  /** "22 Oct", or "" when the leg carries no usable departure date. */
  date: string
  /** Local departure time, "13:45". */
  departTime: string
  /** "Thai Airways TG951, TG471" */
  flights: string
}

function dateLabel(iso: string): string {
  const day = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const [y, m, d] = day.split('-').map(Number)
  return MONTH_DAY.format(new Date(Date.UTC(y, m - 1, d)))
}

/** The carrier and its flight numbers, grouped so a carrier is named once.
 *
 * Consecutive segments on the same airline collapse to one group - "Thai
 * Airways TG951, TG471" rather than "Thai Airways TG951 + Thai Airways TG471",
 * which is how a person reads a connection off a ticket. A leg that genuinely
 * changes carrier names both: "Lufthansa LH800 + Swiss LX123".
 *
 * Consecutive rather than merged across the whole leg, deliberately: an
 * A - B - A routing is two encounters with that airline and flattening them
 * would put its flight numbers in an order the journey is not flown in. */
export function describeFlightNumbers(leg: FlightLeg): string {
  const groups: { airline: string; numbers: string[] }[] = []

  for (const segment of leg.segments) {
    const airline = segment.airline.name || segment.airline.iataCode
    const current = groups[groups.length - 1]
    if (current && current.airline === airline) current.numbers.push(segment.flightNumber)
    else groups.push({ airline, numbers: [segment.flightNumber] })
  }

  if (!groups.length) return leg.airline ?? ''

  return groups
    .map(group => `${group.airline} ${group.numbers.filter(Boolean).join(', ')}`.trim())
    .join(' + ')
}

/** One entry per leg, in travel order. Works unchanged for a one-way, a return
 * and a multi-city, because `slices` is the general list. */
export function identifyItinerary(itinerary: Itinerary): LegIdentity[] {
  return itinerary.slices.map(leg => ({
    route: `${leg.originCode} → ${leg.destinationCode}`,
    date: dateLabel(leg.segments[0]?.departIso ?? ''),
    departTime: leg.departTime,
    flights: describeFlightNumbers(leg),
  }))
}
