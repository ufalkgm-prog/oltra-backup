import type { OfferRequest, OfferSlice } from '@duffel/api/types'

type OfferWithoutServices = OfferRequest['offers'][number]
type TripType = 'one-way' | 'return' | 'multiple'

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

// Duffel's condition fields are a genuine tri-state: `true`/`false` (allowed
// or not) or `null` when the airline hasn't told Duffel either way - collapse
// that into a boolean loses real "unspecified" information, so this stays a
// tri-state rather than defaulting null to false.
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

function segmentAmenities(seg: OfferSlice['segments'][number]): CabinAmenities | null {
  const cabin = seg.passengers?.[0]?.cabin
  if (!cabin) return null
  return {
    wifiAvailable: cabin.amenities?.wifi?.available ?? null,
    wifiCost: cabin.amenities?.wifi?.cost ?? null,
    seatType: cabin.amenities?.seat?.type ?? null,
    seatPitch: cabin.amenities?.seat?.pitch ?? null,
    powerAvailable: cabin.amenities?.power?.available ?? null,
  }
}

function normalizeSegment(seg: OfferSlice['segments'][number]): Segment {
  return {
    airline: {
      name: seg.marketing_carrier.name,
      iataCode: seg.marketing_carrier.iata_code ?? '',
      logoUrl: seg.marketing_carrier.logo_symbol_url ?? null,
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
    originTerminal: seg.origin_terminal ?? null,
    destinationTerminal: seg.destination_terminal ?? null,
    cabinClassMarketingName: seg.passengers?.[0]?.cabin_class_marketing_name ?? '',
    baggages: (seg.passengers?.[0]?.baggages ?? []).map(b => ({ type: b.type, quantity: b.quantity })),
    amenities: segmentAmenities(seg),
  }
}

function sliceConditionFlag(condition: { allowed: boolean } | null | undefined): SliceConditionFlag {
  return condition ? condition.allowed : null
}

function normalizeSliceConditions(slice: OfferSlice): SliceConditions {
  const conditions = (slice as { conditions?: {
    refund_before_departure?: { allowed: boolean } | null
    change_before_departure?: { allowed: boolean } | null
    advance_seat_selection?: boolean | null
    priority_boarding?: boolean | null
    priority_check_in?: boolean | null
  } }).conditions ?? {}

  return {
    refundable: sliceConditionFlag(conditions.refund_before_departure),
    changeable: sliceConditionFlag(conditions.change_before_departure),
    advanceSeatSelection: conditions.advance_seat_selection ?? null,
    priorityBoarding: conditions.priority_boarding ?? null,
    priorityCheckIn: conditions.priority_check_in ?? null,
  }
}

function sliceFingerprint(slice: OfferSlice): string {
  const segmentsKey = slice.segments
    .map(s => `${s.marketing_carrier.iata_code}${s.marketing_carrier_flight_number}@${s.departing_at.slice(0, 16)}`)
    .join('|')
  // Include fare brand: the same physical flight can be sold as distinct
  // fare products (e.g. "Standard" vs "Flex") at very different prices -
  // without this, they'd collapse into a single id and render as
  // indistinguishable duplicate cards with silently different prices.
  const fareBrand = (slice as { fare_brand_name?: string | null }).fare_brand_name ?? ''
  return fareBrand ? `${segmentsKey}#${fareBrand}` : segmentsKey
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
    airlines.push({
      name: seg.marketing_carrier.name,
      iataCode: code,
      logoUrl: seg.marketing_carrier.logo_symbol_url ?? null,
    })
  }

  const longestSeg = segs.reduce(
    (best, seg) => (segmentDurationMinutes(seg) > segmentDurationMinutes(best) ? seg : best),
    first
  )
  const longHaulAirline: AirlineRef | null =
    longestSeg && longestSeg.marketing_carrier.iata_code
      ? {
          name: longestSeg.marketing_carrier.name,
          iataCode: longestSeg.marketing_carrier.iata_code,
          logoUrl: longestSeg.marketing_carrier.logo_symbol_url ?? null,
        }
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
    // Two offers can share identical flight times/carrier (same physical
    // flight) but be different fare products (e.g. "Standard" vs "Flex")
    // priced very differently - surfaced on the card so those don't render
    // as indistinguishable duplicates with silently different prices.
    fareBrand: (slice as { fare_brand_name?: string | null }).fare_brand_name ?? '',
    conditions: normalizeSliceConditions(slice),
  }
}

function totalDuration(item: Omit<Itinerary, 'score'>): number {
  return item.slices.reduce((s, l) => s + l.durationMinutes, 0)
}

function totalStops(item: Omit<Itinerary, 'score'>): number {
  return item.slices.reduce((s, l) => s + l.stops, 0)
}

function computeScores(items: Omit<Itinerary, 'score'>[]): Itinerary[] {
  if (!items.length) return []
  const prices = items.map(i => i.priceEur)
  const durations = items.map(totalDuration)
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const minD = Math.min(...durations), maxD = Math.max(...durations)
  const pRange = maxP - minP || 1
  const dRange = maxD - minD || 1

  return items.map(item => {
    const pNorm = (item.priceEur - minP) / pRange
    const dNorm = (totalDuration(item) - minD) / dRange
    const stops = totalStops(item)
    const score = Math.max(0, Math.min(100, Math.round(100 - pNorm * 35 - dNorm * 30 - stops * 5)))
    return { ...item, score }
  })
}

export function normalizeOffers(offers: OfferWithoutServices[], tripType: TripType): Itinerary[] {
  void tripType
  const raw: Omit<Itinerary, 'score'>[] = offers
    .filter(o => o.slices.length > 0)
    .map(offer => {
      const slices = offer.slices.map(normalizeSlice)
      return {
        id: offer.id,
        offerId: offer.id,
        slices,
        outbound: slices[0]!,
        inbound: slices[1],
        priceEur: parseFloat(offer.total_amount),
        currency: offer.total_currency,
        tags: undefined,
      }
    })
  return computeScores(raw)
}
