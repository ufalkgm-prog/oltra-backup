import { NextRequest, NextResponse } from 'next/server'
import type { CabinClass, CreateOfferRequestPassenger, OfferRequest } from '@duffel/api/types'
import { getDuffel } from '@/lib/flights/duffelClient'

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
  cabinClass?: CabinClass
}

type OfferWithoutServices = OfferRequest['offers'][number]
type CacheEntry = { offers: OfferWithoutServices[]; expiresAt: number }

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
  const cabinClass: CabinClass = body.cabinClass ?? 'economy'

  // Build slices — multi-city path or single/return path
  let slices: Array<{ origin: string; destination: string; departure_date: string; arrival_time: null; departure_time: null }>

  if (body.slices && body.slices.length >= 2) {
    for (const s of body.slices) {
      if (!s.origin || !s.destination || !isIsoDate(s.departureDate)) {
        return NextResponse.json({ ok: false, error: 'Each slice needs origin, destination, departureDate (YYYY-MM-DD)' }, { status: 400 })
      }
    }
    slices = body.slices.map(s => ({
      origin: s.origin,
      destination: s.destination,
      departure_date: s.departureDate,
      arrival_time: null,
      departure_time: null,
    }))
  } else {
    const { origin, destination, departureDate, returnDate } = body
    if (!origin || !destination || !departureDate) {
      return NextResponse.json({ ok: false, error: 'origin, destination, and departureDate are required' }, { status: 400 })
    }
    if (!isIsoDate(departureDate) || (returnDate && !isIsoDate(returnDate))) {
      return NextResponse.json({ ok: false, error: 'Dates must be YYYY-MM-DD' }, { status: 400 })
    }
    slices = [
      { origin, destination, departure_date: departureDate, arrival_time: null, departure_time: null },
      ...(returnDate ? [{ origin: destination, destination: origin, departure_date: returnDate, arrival_time: null, departure_time: null }] : []),
    ]
  }

  const key = JSON.stringify({ slices: slices.map(s => `${s.origin}${s.destination}${s.departure_date}`), adults, children, infants, cabinClass })
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, offers: cached.offers, cached: true })
  }

  const passengers: CreateOfferRequestPassenger[] = [
    ...Array.from({ length: adults }, () => ({ type: 'adult' as const })),
    ...Array.from({ length: children }, () => ({ age: 10 })),
    ...Array.from({ length: infants }, () => ({ age: 0 })),
  ]

  try {
    const duffel = getDuffel()
    const response = await duffel.offerRequests.create({
      slices,
      passengers,
      cabin_class: cabinClass,
      return_offers: true,
    })

    const offers: OfferWithoutServices[] = response.data.offers ?? []
    cache.set(key, { offers, expiresAt: Date.now() + CACHE_TTL_MS })

    return NextResponse.json({ ok: true, offers })
  } catch (err) {
    console.error('[Duffel search]', err)
    const message = err instanceof Error ? err.message : 'Flight search failed'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
