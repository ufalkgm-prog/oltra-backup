import type { OfferRequest, OfferSlice } from '@duffel/api/types'

type OfferWithoutServices = OfferRequest['offers'][number]
type TripType = 'one-way' | 'return' | 'multiple'

export type FlightLeg = {
  id: string
  airline: string
  flightNumber: string
  originCode: string
  destinationCode: string
  departTime: string
  arriveTime: string
  durationMinutes: number
  stops: number
  stopSummary: string
}

export type Itinerary = {
  id: string
  offerId: string
  outbound: FlightLeg
  inbound?: FlightLeg
  priceEur: number
  currency: string
  tags?: string[]
  score: number
}

function parseDuration(iso: string | null | undefined): number {
  if (!iso) return 0
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  return Number(m?.[1] ?? 0) * 60 + Number(m?.[2] ?? 0)
}

function formatTime(dt: string): string {
  return dt.slice(11, 16)
}

function dayOffsetLabel(firstDep: string, lastArr: string): string {
  const diff = Math.round(
    (new Date(lastArr.slice(0, 10)).getTime() - new Date(firstDep.slice(0, 10)).getTime()) / 86400000
  )
  return diff > 0 ? ` +${diff}` : ''
}

function placeCode(place: unknown): string {
  return (place as { iata_code?: string | null })?.iata_code ?? ''
}

function buildStopSummary(slice: OfferSlice): string {
  const segs = slice.segments
  if (segs.length <= 1) return 'Direct'
  const parts = segs.slice(0, -1).map((seg, i) => {
    const next = segs[i + 1]!
    const mins = Math.round(
      (new Date(next.departing_at).getTime() - new Date(seg.arriving_at).getTime()) / 60000
    )
    return `${placeCode(seg.destination)} ${Math.floor(mins / 60)}h ${mins % 60}m`
  })
  return `${segs.length - 1} stop · ${parts[0] ?? ''}`
}

function sliceFingerprint(slice: OfferSlice): string {
  return slice.segments
    .map(s => `${s.marketing_carrier.iata_code}${s.marketing_carrier_flight_number}@${s.departing_at.slice(0, 16)}`)
    .join('|')
}

function normalizeSlice(slice: OfferSlice): FlightLeg {
  const segs = slice.segments
  const first = segs[0]!
  const last = segs[segs.length - 1]!

  const computedDuration = Math.round(
    (new Date(last.arriving_at).getTime() - new Date(first.departing_at).getTime()) / 60000
  )

  return {
    id: sliceFingerprint(slice),
    airline: first.marketing_carrier.name,
    flightNumber: `${first.marketing_carrier.iata_code}${first.marketing_carrier_flight_number}`,
    originCode: placeCode(slice.origin) || placeCode(first.origin),
    destinationCode: placeCode(slice.destination) || placeCode(last.destination),
    departTime: formatTime(first.departing_at),
    arriveTime: formatTime(last.arriving_at) + dayOffsetLabel(first.departing_at, last.arriving_at),
    durationMinutes: parseDuration(slice.duration) || computedDuration,
    stops: segs.length - 1,
    stopSummary: buildStopSummary(slice),
  }
}

function computeScores(items: Omit<Itinerary, 'score'>[]): Itinerary[] {
  if (!items.length) return []
  const prices = items.map(i => i.priceEur)
  const durations = items.map(i => i.outbound.durationMinutes + (i.inbound?.durationMinutes ?? 0))
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const minD = Math.min(...durations), maxD = Math.max(...durations)
  const pRange = maxP - minP || 1
  const dRange = maxD - minD || 1

  return items.map(item => {
    const pNorm = (item.priceEur - minP) / pRange
    const dur = item.outbound.durationMinutes + (item.inbound?.durationMinutes ?? 0)
    const dNorm = (dur - minD) / dRange
    const stops = item.outbound.stops + (item.inbound?.stops ?? 0)
    const score = Math.max(0, Math.min(100, Math.round(100 - pNorm * 35 - dNorm * 30 - stops * 5)))
    return { ...item, score }
  })
}

export function normalizeOffers(offers: OfferWithoutServices[], tripType: TripType): Itinerary[] {
  void tripType
  const raw: Omit<Itinerary, 'score'>[] = offers
    .filter(o => o.slices.length > 0)
    .map(offer => ({
      id: offer.id,
      offerId: offer.id,
      outbound: normalizeSlice(offer.slices[0]!),
      inbound: offer.slices[1] ? normalizeSlice(offer.slices[1]) : undefined,
      priceEur: parseFloat(offer.total_amount),
      currency: offer.total_currency,
      tags: undefined,
    }))
  return computeScores(raw)
}
