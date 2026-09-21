/* The `.ts` on these two imports is deliberate and load-bearing: it is what
 * lets `npm test` run this file directly on Node, which needs the real
 * extension to resolve a TypeScript module. Everything else in the codebase
 * imports extensionless through the bundler, and should keep doing so - this
 * file and `itinerary.ts` are the pair under test. */
import {
  TRIP_COM_CABIN_CODE,
  TRIP_COM_CURRENCIES,
  TRIP_COM_FALLBACK_CURRENCY,
  TRIP_COM_LOCALE,
  TRIP_COM_SEARCH_FORM_MARKERS,
  TRIP_COM_SEARCH_URL,
  TRIP_COM_TRACKING,
  type TripComPlacement,
} from './partners.ts'
import { isNonstop, tripShapeOf, type SelectedItinerary } from './itinerary.ts'

/* BUILD THE TRIP.COM LINK. From parameters, never from a stored example.
 *
 * One function for all three trip types, because the itinerary is a list of
 * legs and the trip type is read off that list rather than passed in - a caller
 * that had to say "this is a round trip" is a caller that can say it about two
 * legs that are not one.
 *
 * WHAT THE LINK CAN AND CANNOT DO. It opens a filtered search, not the flight
 * the concierge recommended (spec §4). The filters that survive into a URL are
 * the cabin, the passenger counts, the dates, the route and nonstop-only -
 * there is no airline parameter, confirmed by testing: filtering to a carrier
 * on the results page changes page state and leaves the URL unchanged. So the
 * copy next to this link has to name the carrier and the flight numbers, and
 * has to say "the options for these dates" rather than "book this flight". */

type BuildOptions = {
  /** Which button this link sits on. Reported as `trip_sub1`. */
  placement: TripComPlacement
  /** The member's display currency. Anything unrecognised falls back to EUR. */
  currency?: string
  /** Overrides the derivation from the legs. Leave unset: derived is right
   * almost always, and a wrong `true` shows the member an empty results page. */
  nonstopOnly?: boolean
  locale?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const IATA = /^[A-Za-z]{3}$/

/** Trip.com's `triptype` codes. Lowercase, which is what their own search box
 * emits; uppercase is also tolerated, and mixing the two for no reason is how a
 * later reader ends up wondering which one is load-bearing. */
const TRIP_TYPE_CODE = {
  'one-way': 'ow',
  return: 'rt',
  'multi-city': 'mt',
} as const

function assertLeg(leg: { origin: string; destination: string; date: string }, index: number) {
  if (!IATA.test(leg.origin) || !IATA.test(leg.destination)) {
    throw new Error(
      `Trip.com link: leg ${index} needs IATA codes, got "${leg.origin}"-"${leg.destination}"`
    )
  }
  if (!ISO_DATE.test(leg.date)) {
    throw new Error(`Trip.com link: leg ${index} needs a YYYY-MM-DD date, got "${leg.date}"`)
  }
}

/** Anything we do not recognise becomes EUR. See TRIP_COM_CURRENCIES for why
 * this is checked here and cannot be checked anywhere else. */
function currencyFor(requested: string | undefined): string {
  const code = (requested ?? '').trim().toUpperCase()
  return (TRIP_COM_CURRENCIES as readonly string[]).includes(code)
    ? code
    : TRIP_COM_FALLBACK_CURRENCY
}

/**
 * A tracked Trip.com search URL for the journey the member chose.
 *
 * Throws on an itinerary it cannot express - no legs, a code that is not IATA,
 * a date that is not YYYY-MM-DD. Loudly wrong beats quietly wrong here: a link
 * built from half-read data still opens, and lands the member on a search for
 * somewhere they are not going.
 */
export function buildTripComUrl(
  itinerary: SelectedItinerary,
  options: BuildOptions
): string {
  const { legs, cabin, passengers } = itinerary
  if (!legs.length) throw new Error('Trip.com link: itinerary has no legs')
  legs.forEach(assertLeg)

  const shape = tripShapeOf(legs)
  const params = new URLSearchParams()

  /* Lowercase IATA throughout, as Trip.com's own search box emits.
   *
   * `dcity` expects a city code and we only ever hold airport codes - every
   * airport in the app comes from an airport list. Ulrik verified on 2026-09-21
   * that an airport code is accepted there (dcity=lhr&dairport=lhr returned
   * London to Sydney), so the same code goes in both and there is no
   * airport-to-city lookup to get wrong. */
  const code = (value: string) => value.trim().toLowerCase()

  if (shape === 'multi-city') {
    /* Zero-indexed groups, one per leg, and NO ddate/rdate/dcity/acity: the
     * single-leg parameters and the indexed ones are two different forms of the
     * same search and Trip.com is given one or the other. */
    legs.forEach((leg, i) => {
      params.set(`multdcity${i}`, code(leg.origin))
      params.set(`multacity${i}`, code(leg.destination))
      params.set(`multddate${i}`, leg.date)
      /* Both airports on every leg. The captured example carried them
       * inconsistently (dairport0, aairport1, dairport2) because its search
       * form held a specific airport only on those legs; ours always does. */
      params.set(`dairport${i}`, code(leg.origin))
      params.set(`aairport${i}`, code(leg.destination))
    })
  } else {
    const [outbound] = legs
    params.set('dcity', code(outbound.origin))
    params.set('acity', code(outbound.destination))
    params.set('ddate', outbound.date)
    /* `rdate` only on a round trip. Trip.com's own front end emits a stale
     * rdate on one-way searches and ignores it; we omit it, which is the same
     * result without the stale value. */
    if (shape === 'return') params.set('rdate', legs[1].date)
    params.set('dairport', code(outbound.origin))
  }

  params.set('triptype', TRIP_TYPE_CODE[shape])
  params.set('class', TRIP_COM_CABIN_CODE[cabin])

  /* Single and top-level on every trip type, multi-city included - the
   * passenger counts and the filters are not per leg. */
  params.set('quantity', String(passengers.adults))
  params.set('childqty', String(passengers.children))
  params.set('babyqty', String(passengers.infants))

  /* The only filter in the URL that meaningfully narrows the results list, so
   * it is set whenever it is accurate. `isNonstop` refuses to claim a journey
   * is direct unless every leg says so - an unknown leg is not a direct one. */
  const nonstop = options.nonstopOnly ?? isNonstop(legs)
  params.set('nonstoponly', nonstop ? 'on' : 'off')

  params.set('locale', options.locale ?? TRIP_COM_LOCALE)
  params.set('curr', currencyFor(options.currency))
  params.set('lowpricesource', TRIP_COM_SEARCH_FORM_MARKERS.lowpricesource)
  params.set('searchboxarg', TRIP_COM_SEARCH_FORM_MARKERS.searchboxarg)

  params.set('Allianceid', TRIP_COM_TRACKING.Allianceid)
  params.set('SID', TRIP_COM_TRACKING.SID)
  params.set('trip_sub3', TRIP_COM_TRACKING.trip_sub3)
  params.set('trip_sub1', options.placement)

  return `${TRIP_COM_SEARCH_URL}?${params.toString()}`
}
