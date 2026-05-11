import type { OfferRequest, OfferSlice } from '@duffel/api/types'

type OfferWithoutServices = OfferRequest['offers'][number]
type TripType = 'one-way' | 'return' | 'multiple'

export type AirlineRef = {
  name: string
  iataCode: string
}

export type Layover = {
  code: string
  name: string
  durationMinutes: number
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

function placeDisplayName(place: unknown): string {
  const p = place as { name?: string | null; city?: { name?: string | null } | null; iata_code?: string | null } | null
  return p?.city?.name ?? p?.name ?? p?.iata_code ?? ''
}

function buildLayovers(slice: OfferSlice): Layover[] {
  const segs = slice.segments
  if (segs.length <= 1) return []
  return segs.slice(0, -1).map((seg, i) => {
    const next = segs[i + 1]!
    const mins = Math.round(
      (new Date(next.departing_at).getTime() - new Date(seg.arriving_at).getTime()) / 60000
    )
    return {
      code: placeCode(seg.destination),
      name: placeDisplayName(seg.destination),
      durationMinutes: mins,
    }
  })
}

function formatStopDuration(mins: number): string {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function buildStopSummary(layovers: Layover[]): string {
  if (!layovers.length) return 'Direct'
  const stopWord = layovers.length === 1 ? 'stop' : 'stops'
  const parts = layovers.map(l => `${l.name} ${formatStopDuration(l.durationMinutes)}`)
  return `${layovers.length} ${stopWord} · ${parts.join(', ')}`
}

function placeTimezone(place: unknown): string {
  return (place as { time_zone?: string | null })?.time_zone ?? ''
}

function placeName(place: unknown): string {
  const p = place as { name?: string | null; city?: { name?: string | null } | null } | null
  return p?.city?.name ?? p?.name ?? ''
}

function normalizeSegment(seg: OfferSlice['segments'][number]): Segment {
  return {
    airline: {
      name: seg.marketing_carrier.name,
      iataCode: seg.marketing_carrier.iata_code ?? '',
    },
    flightNumber: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
    originCode: placeCode(seg.origin),
    originName: placeName(seg.origin) || placeCode(seg.origin),
    destinationCode: placeCode(seg.destination),
    destinationName: placeName(seg.destination) || placeCode(seg.destination),
    departIso: seg.departing_at,
    arriveIso: seg.arriving_at,
    departTime: formatTime(seg.departing_at),
    arriveTime: formatTime(seg.arriving_at),
    durationMinutes: segmentDurationMinutes(seg),
    aircraft: (seg as { aircraft?: { name?: string | null } | null }).aircraft?.name ?? '',
    originTimezone: placeTimezone(seg.origin),
    destinationTimezone: placeTimezone(seg.destination),
  }
}

function sliceFingerprint(slice: OfferSlice): string {
  return slice.segments
    .map(s => `${s.marketing_carrier.iata_code}${s.marketing_carrier_flight_number}@${s.departing_at.slice(0, 16)}`)
    .join('|')
}

function segmentDurationMinutes(seg: OfferSlice['segments'][number]): number {
  const iso = parseDuration(seg.duration as string | null | undefined)
  if (iso) return iso
  return Math.round(
    (new Date(seg.arriving_at).getTime() - new Date(seg.departing_at).getTime()) / 60000
  )
}

function normalizeSlice(slice: OfferSlice): FlightLeg {
  const segs = slice.segments
  const first = segs[0]!
  const last = segs[segs.length - 1]!

  const computedDuration = Math.round(
    (new Date(last.arriving_at).getTime() - new Date(first.departing_at).getTime()) / 60000
  )

  const seenCarriers = new Set<string>()
  const airlines: AirlineRef[] = []
  for (const seg of segs) {
    const code = seg.marketing_carrier.iata_code
    if (!code || seenCarriers.has(code)) continue
    seenCarriers.add(code)
    airlines.push({ name: seg.marketing_carrier.name, iataCode: code })
  }

  const longestSeg = segs.reduce(
    (best, seg) => (segmentDurationMinutes(seg) > segmentDurationMinutes(best) ? seg : best),
    first
  )
  const longHaulAirline: AirlineRef | null =
    longestSeg && longestSeg.marketing_carrier.iata_code
      ? { name: longestSeg.marketing_carrier.name, iataCode: longestSeg.marketing_carrier.iata_code }
      : null

  const layovers = buildLayovers(slice)
  const segments = segs.map(normalizeSegment)

  return {
    id: sliceFingerprint(slice),
    airline: first.marketing_carrier.name,
    airlines,
    longHaulAirline,
    flightNumber: `${first.marketing_carrier.iata_code}${first.marketing_carrier_flight_number}`,
    originCode: placeCode(slice.origin) || placeCode(first.origin),
    destinationCode: placeCode(slice.destination) || placeCode(last.destination),
    departTime: formatTime(first.departing_at),
    arriveTime: formatTime(last.arriving_at) + dayOffsetLabel(first.departing_at, last.arriving_at),
    durationMinutes: parseDuration(slice.duration) || computedDuration,
    stops: segs.length - 1,
    stopSummary: buildStopSummary(layovers),
    layovers,
    segments,
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
