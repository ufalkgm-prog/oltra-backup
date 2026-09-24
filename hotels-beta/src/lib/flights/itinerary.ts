/* OUR OWN FLIGHT SHAPE — the boundary every supplier is normalised to.
 *
 * WHY THIS FILE IMPORTS NOTHING. That is the whole point of it. Which company
 * supplies our flight data is undecided: Duffel today, possibly Amadeus, Kayak
 * or Wego, possibly something else after launch. Everything downstream — the
 * concierge, the flight cards, the partner handoff — has to reason about a
 * journey, not about a supplier's JSON. So the types live here, in a file with
 * no dependency on any of them, and a connector's job is to produce these.
 *
 * Swapping supplier is then writing one connector, not rewriting the app.
 *
 * These declarations were previously inside `duffelNormalizer.ts`, which is
 * where the ambiguity was: the shapes were already supplier-neutral, but they
 * sat in the same file that imports Duffel's types, so nothing said whether
 * `FlightLeg` described a journey or described Duffel. It describes a journey.
 * `duffelNormalizer.ts` re-exports them, so every existing import still works
 * and this move changed no behaviour.
 *
 * TWO SHAPES LIVE HERE, and the difference matters:
 *
 *   `Itinerary` and below  — what a SEARCH returned. Rich: segments, aircraft,
 *                            baggage, fare conditions, a price. Built by a
 *                            connector from a supplier's response.
 *   `SelectedItinerary`    — what the member CHOSE, reduced to the journey
 *                            itself. No price, no segments, no supplier. It is
 *                            the only input a partner link builder may take,
 *                            because a partner link is about where and when
 *                            someone is flying and nothing else.
 *
 * `selectedItineraryFrom` turns the first into the second, and is the only
 * place that conversion happens. */

/* ------------------------------------------------ what a search returns --- */

export type TripType = 'one-way' | 'return' | 'multiple'

export type AirlineRef = {
  name: string
  iataCode: string
  logoUrl: string | null
}

export type Layover = {
  code: string
  name: string
  durationMinutes: number
}

export type Baggage = {
  type: 'carry_on' | 'checked'
  quantity: number
}

export type CabinAmenities = {
  wifiAvailable: boolean | null
  wifiCost: string | null
  seatType: string | null
  seatPitch: string | null
  powerAvailable: boolean | null
}

export type Segment = {
  airline: AirlineRef
  flightNumber: string
  originCode: string
  originName: string
  destinationCode: string
  destinationName: string
  departIso: string
  arriveIso: string
  departTime: string
  arriveTime: string
  durationMinutes: number
  aircraft: string
  originTimezone: string
  destinationTimezone: string
  originTerminal: string | null
  destinationTerminal: string | null
  cabinClassMarketingName: string
  baggages: Baggage[]
  amenities: CabinAmenities | null
}

// A genuine tri-state: `true`/`false` (allowed or not) or `null` when the
// airline hasn't said either way - collapsing that into a boolean loses real
// "unspecified" information, so this stays a tri-state rather than defaulting
// null to false.
export type SliceConditionFlag = boolean | null

export type SliceConditions = {
  refundable: SliceConditionFlag
  changeable: SliceConditionFlag
  advanceSeatSelection: SliceConditionFlag
  priorityBoarding: SliceConditionFlag
  priorityCheckIn: SliceConditionFlag
}

export type FlightLeg = {
  id: string
  airline: string
  airlines: AirlineRef[]
  longHaulAirline: AirlineRef | null
  flightNumber: string
  originCode: string
  destinationCode: string
  departTime: string
  arriveTime: string
  durationMinutes: number
  stops: number
  stopSummary: string
  layovers: Layover[]
  segments: Segment[]
  fareBrand: string
  conditions: SliceConditions
}

export type Itinerary = {
  id: string
  offerId: string
  slices: FlightLeg[]
  outbound: FlightLeg
  inbound?: FlightLeg
  priceEur: number
  currency: string
  tags?: string[]
  score: number
}

/* -------------------------------------------------- what a search asks ---- */

/** The four cabins, in the spelling the rest of the app already uses.
 *
 * Three spellings are in circulation — the supplier's `premium_economy`, the
 * Flights page's display label `"Premium Economy"`, and the handoff spec's
 * `premium`. This is the canonical one, and `toCabin` accepts all three so a
 * caller never has to know which it is holding. */
export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'

export type PassengerCounts = {
  adults: number
  children: number
  infants: number
  /** The seated children's ages where known (lib/flights/passengers.ts). */
  childAges?: number[]
}

/** What we ask a supplier for. Legs, not origin/destination/returnDate, for
 * the same reason `SelectedItinerary` uses legs: one shape covers one-way,
 * return and multi-city. */
export type ItineraryQuery = {
  legs: { origin: string; destination: string; date: string }[]
  cabin: Cabin
  passengers: PassengerCounts
}

/** What a supplier connector must provide, and the whole of it.
 *
 * A connector owns exactly two supplier-specific things: turning an
 * `ItineraryQuery` into that supplier's search request, and turning the
 * response into `Itinerary[]`. Nothing else in the app may import a supplier's
 * SDK or types. `providers/duffel.ts` is the one implementation today. */
export interface FlightConnector {
  /** For logs and for telling two connectors apart while one replaces the other. */
  readonly id: string
  search(query: ItineraryQuery): Promise<Itinerary[]>
}

/* --------------------------------------------- what the member selected --- */

/** One flight in the journey the member chose.
 *
 * `origin` and `destination` are IATA AIRPORT codes, because that is the only
 * thing our data ever holds — every airport in the app comes from
 * `airportOptions.ts` / `cityAirports.ts`, which are airport lists, not city
 * lists. There is deliberately no separate "city code" field: Ulrik verified
 * on 2026-09-21 that Trip.com accepts an airport code where it expects a city
 * (`dcity=lhr&dairport=lhr` returned London to Sydney results), so no
 * airport-to-city lookup is needed and one that guessed would be a new way to
 * be wrong.
 *
 * `nonstop` is optional and means what it says: `true` for a flight with no
 * stops, `false` for one with stops, and absent when whoever built this leg did
 * not know. Absent is not `false` — it is the reason `isNonstop` below refuses
 * to claim a journey is direct unless every leg says so. */
export type SelectedLeg = {
  origin: string
  destination: string
  /** YYYY-MM-DD. */
  date: string
  nonstop?: boolean
}

/** The journey the member chose, and nothing else.
 *
 * Note what is NOT here: no price, no offer id, no supplier, no fare
 * conditions. A partner handoff is a search we are pre-filling on someone
 * else's site, and none of that is expressible in a search. Keeping it out
 * means a link builder cannot accidentally leak a figure that came from a
 * different source than the one the member is about to pay. */
export type SelectedItinerary = {
  legs: SelectedLeg[]
  cabin: Cabin
  passengers: PassengerCounts
}

/** One-way, there-and-back, or anything else.
 *
 * Derived from the legs rather than carried as a field, so it cannot disagree
 * with them. The middle case is the handoff spec's rule exactly: two legs that
 * mirror each other. Dates are deliberately not consulted — a return dated
 * before its outbound is bad data upstream, and silently reclassifying it as
 * multi-city would hide that rather than fix it. */
export function tripShapeOf(legs: SelectedLeg[]): 'one-way' | 'return' | 'multi-city' {
  if (legs.length === 1) return 'one-way'
  if (legs.length === 2) {
    const [out, back] = legs
    if (back.origin === out.destination && back.destination === out.origin) return 'return'
  }
  return 'multi-city'
}

/** True only when every leg is known to have no stops.
 *
 * A leg with no `nonstop` flag is unknown, not direct. This feeds a filter on a
 * partner's site that hides everything with a connection, so a wrong `true`
 * shows the member an empty results page for a journey that exists. */
export function isNonstop(legs: SelectedLeg[]): boolean {
  return legs.length > 0 && legs.every(leg => leg.nonstop === true)
}

/** Accept any of the three cabin spellings in circulation, and never throw.
 *
 * Falls back to economy, because a cabin we cannot read is a reason to show
 * the member the broadest set of results rather than to fail the handoff. */
export function toCabin(value: string | null | undefined): Cabin {
  const key = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (key === 'first') return 'first'
  if (key === 'business') return 'business'
  if (key === 'premium' || key === 'premium_economy') return 'premium_economy'
  return 'economy'
}

/** Reduce a search result to the journey the member chose.
 *
 * `slices` rather than `outbound`/`inbound`, because slices is the general
 * list: one entry for a one-way, two for a return, more for a multi-city, and
 * `tripShapeOf` reads the shape back off it. The date comes from the first
 * segment's ISO departure, which is the only place a leg carries a date at all.
 *
 * This is the single crossing point between "what a supplier returned" and
 * "what we hand to a partner", which is why it is one function and not a
 * conversion written out at each call site. */
export function selectedItineraryFrom(
  itinerary: Itinerary,
  cabin: Cabin,
  passengers: PassengerCounts
): SelectedItinerary {
  return {
    legs: itinerary.slices.map(slice => ({
      origin: slice.originCode,
      destination: slice.destinationCode,
      date: slice.segments[0]?.departIso.slice(0, 10) ?? '',
      nonstop: slice.stops === 0,
    })),
    cabin,
    passengers,
  }
}
