import { NextRequest, NextResponse } from 'next/server'
import { flightDataIsSynthetic } from '@/lib/flights/duffelClient'
import { toCabin, type Itinerary } from '@/lib/flights/itinerary'
import { duffelConnector } from '@/lib/flights/providers/duffel'

/* THE BROWSER ASKS FOR FLIGHTS AND IS GIVEN OURS, not a supplier's.
 *
 * This route used to return Duffel's raw offers, and four components -
 * FlightsView, LandingSummary, AiResultFrames, SavedTripsView - each imported
 * `normalizeOffers` and converted them in the browser. That put Duffel's
 * response format in the client bundle and made a supplier swap a change in
 * five files rather than one. It now normalises here, so nothing outside
 * `lib/flights/providers` has ever seen a supplier's shape.
 *
 * It is still not a booking endpoint and never will be: myOLTRA does not sell
 * flights. Search only. */

type SliceInput = { origin: string; destination: string; departureDate: string }

export interface FlightSearchRequest {
  // Single/return trip
  origin?: string
  destination?: string
  departureDate?: string
  returnDate?: string
  // Multi-city (overrides origin/destination/dates when provided)
  slices?: SliceInput[]
  // Shared
  adults?: number
  children?: number
  infants?: number
  /** economy | premium_economy | business | first, in any of the spellings
   * `toCabin` accepts. Deliberately a plain string rather than a supplier's
   * cabin union: the request shape is ours too. */
  cabinClass?: string
}

type CacheEntry = { itineraries: Itinerary[]; expiresAt: number }

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 15 * 60 * 1000

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export async function POST(req: NextRequest) {
  let body: FlightSearchRequest
  try {
    body = (await req.json()) as FlightSearchRequest
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const adults = Math.max(1, body.adults ?? 1)
  const children = Math.max(0, body.children ?? 0)
  const infants = Math.max(0, body.infants ?? 0)
  const cabin = toCabin(body.cabinClass)

  // Build legs — multi-city path or single/return path
  let legs: { origin: string; destination: string; date: string }[]

  if (body.slices && body.slices.length >= 2) {
    for (const s of body.slices) {
      if (!s.origin || !s.destination || !isIsoDate(s.departureDate)) {
        return NextResponse.json({ ok: false, error: 'Each slice needs origin, destination, departureDate (YYYY-MM-DD)' }, { status: 400 })
      }
    }
    legs = body.slices.map(s => ({
      origin: s.origin,
      destination: s.destination,
      date: s.departureDate,
    }))
  } else {
    const { origin, destination, departureDate, returnDate } = body
    if (!origin || !destination || !departureDate) {
      return NextResponse.json({ ok: false, error: 'origin, destination, and departureDate are required' }, { status: 400 })
    }
    if (!isIsoDate(departureDate) || (returnDate && !isIsoDate(returnDate))) {
      return NextResponse.json({ ok: false, error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
    }
    legs = [
      { origin, destination, date: departureDate },
      ...(returnDate ? [{ origin: destination, destination: origin, date: returnDate }] : []),
    ]
  }

  const key = JSON.stringify({ legs: legs.map(l => `${l.origin}${l.destination}${l.date}`), adults, children, infants, cabin })
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, itineraries: cached.itineraries, cached: true, synthetic: flightDataIsSynthetic() })
  }

  try {
    const itineraries = await duffelConnector.search({
      legs,
      cabin,
      passengers: { adults, children, infants },
    })
    cache.set(key, { itineraries, expiresAt: Date.now() + CACHE_TTL_MS })

    /* `synthetic` says the offers came from Duffel's test environment, which
     * fabricates a nonstop on every route (see duffelClient). The browser
     * cannot read the token, and the landing page now DECIDES which airport to
     * put first from these durations - so it has to be told, or it ranks on
     * fiction and looks confident about it. */
    return NextResponse.json({ ok: true, itineraries, synthetic: flightDataIsSynthetic() })
  } catch (err) {
    console.error('[flights search]', err)
    const message = err instanceof Error ? err.message : 'Flight search failed'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
