import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTripComUrl } from './tripCom.ts'
import type { Cabin, SelectedItinerary } from './itinerary.ts'

/* WHAT THESE TESTS CAN AND CANNOT PROVE.
 *
 * They prove the URL we build says what we meant: the right route, the right
 * dates, the right cabin, the right passenger counts, the right trip type, and
 * the affiliate identifiers present and correct.
 *
 * They cannot prove Trip.com honours it, and they cannot prove the click
 * registers in the affiliate dashboard. That second one is the failure mode
 * that is silent - a link with broken tracking opens a perfectly good search
 * page and earns nothing - and it can only be checked by a human clicking a
 * generated link and looking at the report. See the checklist in
 * docs/trip-com-handoff-spec.md §5.
 *
 * Run with `npm test`. Node runs TypeScript directly, so there is no test
 * framework and no new dependency. */

const params = (url: string) => new URL(url).searchParams
const get = (url: string, key: string) => params(url).get(key)

const PAX = { adults: 2, children: 1, infants: 0 }

const oneWay: SelectedItinerary = {
  legs: [{ origin: 'CPH', destination: 'SYD', date: '2026-10-22', nonstop: false }],
  cabin: 'business',
  passengers: PAX,
}

const roundTrip: SelectedItinerary = {
  legs: [
    { origin: 'CPH', destination: 'SYD', date: '2026-10-22', nonstop: false },
    { origin: 'SYD', destination: 'CPH', date: '2026-10-31', nonstop: false },
  ],
  cabin: 'business',
  passengers: PAX,
}

const multiCity: SelectedItinerary = {
  legs: [
    { origin: 'CPH', destination: 'SYD', date: '2026-10-22', nonstop: false },
    { origin: 'SYD', destination: 'CHC', date: '2026-10-28', nonstop: true },
    { origin: 'CHC', destination: 'CPH', date: '2026-11-02', nonstop: false },
  ],
  cabin: 'business',
  passengers: PAX,
}

const opts = { placement: 'concierge-chat' as const, currency: 'DKK' }

/* ------------------------------------------------------------ one-way --- */

test('one-way sends triptype=ow and the single-leg parameters', () => {
  const url = buildTripComUrl(oneWay, opts)
  assert.equal(get(url, 'triptype'), 'ow')
  assert.equal(get(url, 'dcity'), 'cph')
  assert.equal(get(url, 'acity'), 'syd')
  assert.equal(get(url, 'ddate'), '2026-10-22')
  assert.equal(get(url, 'dairport'), 'cph')
})

test('one-way omits rdate entirely', () => {
  /* Trip.com's own front end emits a stale rdate on one-way searches and
   * ignores it. We send nothing, which is the same result without a wrong date
   * sitting in a URL a member can read. */
  const url = buildTripComUrl(oneWay, opts)
  assert.equal(params(url).has('rdate'), false)
  assert.equal(url.includes('rdate'), false)
})

test('one-way sends no indexed multi-city parameters', () => {
  const url = buildTripComUrl(oneWay, opts)
  for (const key of [...params(url).keys()]) {
    assert.ok(!/^(mult|dairport\d|aairport\d)/.test(key), `unexpected ${key}`)
  }
})

/* --------------------------------------------------------- round trip --- */

test('two mirrored legs are a round trip, with rdate from the second leg', () => {
  const url = buildTripComUrl(roundTrip, opts)
  assert.equal(get(url, 'triptype'), 'rt')
  assert.equal(get(url, 'dcity'), 'cph')
  assert.equal(get(url, 'acity'), 'syd')
  assert.equal(get(url, 'ddate'), '2026-10-22')
  assert.equal(get(url, 'rdate'), '2026-10-31')
})

test('the round trip reproduces the verified capture, parameter for parameter', () => {
  /* The live URL in docs/trip-com-handoff-spec.md §1: Copenhagen to Sydney,
   * business, 2 adults + 1 child, round trip. If this test fails, either the
   * builder drifted or the spec did - check which before changing either. */
  const url = buildTripComUrl(roundTrip, opts)
  const expected: Record<string, string> = {
    dcity: 'cph',
    acity: 'syd',
    ddate: '2026-10-22',
    rdate: '2026-10-31',
    dairport: 'cph',
    triptype: 'rt',
    class: 'c',
    quantity: '2',
    childqty: '1',
    nonstoponly: 'off',
    locale: 'en-XX',
    curr: 'DKK',
    lowpricesource: 'searchform',
    searchboxarg: 't',
  }
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(get(url, key), value, `${key} should be ${value}`)
  }
})

test('two legs that do not mirror are multi-city, not a round trip', () => {
  /* An open jaw: fly into Nice, home out of Marseille. Flattening that into a
   * return would send the member home from an airport they are not in. */
  const openJaw: SelectedItinerary = {
    ...roundTrip,
    legs: [
      { origin: 'CPH', destination: 'NCE', date: '2026-10-22' },
      { origin: 'MRS', destination: 'CPH', date: '2026-10-31' },
    ],
  }
  const url = buildTripComUrl(openJaw, opts)
  assert.equal(get(url, 'triptype'), 'mt')
  assert.equal(params(url).has('rdate'), false)
})

/* --------------------------------------------------------- multi-city --- */

test('multi-city sends one zero-indexed group per leg', () => {
  const url = buildTripComUrl(multiCity, opts)
  assert.equal(get(url, 'triptype'), 'mt')

  assert.equal(get(url, 'multdcity0'), 'cph')
  assert.equal(get(url, 'multacity0'), 'syd')
  assert.equal(get(url, 'multddate0'), '2026-10-22')

  assert.equal(get(url, 'multdcity1'), 'syd')
  assert.equal(get(url, 'multacity1'), 'chc')
  assert.equal(get(url, 'multddate1'), '2026-10-28')

  assert.equal(get(url, 'multdcity2'), 'chc')
  assert.equal(get(url, 'multacity2'), 'cph')
  assert.equal(get(url, 'multddate2'), '2026-11-02')

  assert.equal(get(url, 'dairport0'), 'cph')
  assert.equal(get(url, 'aairport2'), 'cph')
})

test('multi-city sends no single-leg route or date parameters', () => {
  /* The two forms are alternatives. Sending ddate or dcity alongside the
   * indexed groups describes two different searches in one URL. */
  const url = buildTripComUrl(multiCity, opts)
  for (const key of ['dcity', 'acity', 'ddate', 'rdate']) {
    assert.equal(params(url).has(key), false, `${key} should be absent`)
  }
})

test('multi-city keeps cabin, passengers and filters top-level and unindexed', () => {
  const url = buildTripComUrl(multiCity, opts)
  assert.equal(get(url, 'class'), 'c')
  assert.equal(get(url, 'quantity'), '2')
  assert.equal(get(url, 'childqty'), '1')
  assert.equal(get(url, 'babyqty'), '0')
  assert.equal(get(url, 'curr'), 'DKK')
  for (const key of [...params(url).keys()]) {
    assert.ok(!/^(class|quantity|childqty|babyqty|nonstoponly|locale|curr)\d/.test(key))
  }
})

/* ------------------------------------------------------------- cabins --- */

test('each of the four cabins maps to its own class code', () => {
  const codes: Record<Cabin, string> = {
    economy: 'y',
    premium_economy: 's',
    business: 'c',
    first: 'f',
  }
  for (const [cabin, code] of Object.entries(codes) as [Cabin, string][]) {
    const url = buildTripComUrl({ ...roundTrip, cabin }, opts)
    assert.equal(get(url, 'class'), code, `${cabin} should send class=${code}`)
  }
})

/* ----------------------------------------------------------- infants --- */

test('infants travel as babyqty, separately from children', () => {
  const url = buildTripComUrl(
    { ...roundTrip, passengers: { adults: 2, children: 1, infants: 1 } },
    opts
  )
  assert.equal(get(url, 'quantity'), '2')
  assert.equal(get(url, 'childqty'), '1')
  assert.equal(get(url, 'babyqty'), '1')
})

test('babyqty is sent as 0 rather than omitted when there are no infants', () => {
  const url = buildTripComUrl(roundTrip, opts)
  assert.equal(get(url, 'babyqty'), '0')
})

test('a family of four with two infants sends every count', () => {
  const url = buildTripComUrl(
    { ...oneWay, passengers: { adults: 2, children: 2, infants: 2 } },
    opts
  )
  assert.equal(get(url, 'quantity'), '2')
  assert.equal(get(url, 'childqty'), '2')
  assert.equal(get(url, 'babyqty'), '2')
})

/* ------------------------------------------------------- nonstop only --- */

test('nonstoponly is on when every leg is nonstop', () => {
  const direct: SelectedItinerary = {
    ...roundTrip,
    legs: [
      { origin: 'CPH', destination: 'LHR', date: '2026-10-22', nonstop: true },
      { origin: 'LHR', destination: 'CPH', date: '2026-10-31', nonstop: true },
    ],
  }
  assert.equal(get(buildTripComUrl(direct, opts), 'nonstoponly'), 'on')
})

test('one leg with a stop turns nonstoponly off', () => {
  const mixed: SelectedItinerary = {
    ...roundTrip,
    legs: [
      { origin: 'CPH', destination: 'SYD', date: '2026-10-22', nonstop: true },
      { origin: 'SYD', destination: 'CPH', date: '2026-10-31', nonstop: false },
    ],
  }
  assert.equal(get(buildTripComUrl(mixed, opts), 'nonstoponly'), 'off')
})

test('a leg that does not say is not treated as nonstop', () => {
  /* Absent is unknown, not direct. A wrong `on` hides every flight that exists
   * on the route and shows the member an empty page. */
  const unknown: SelectedItinerary = {
    ...oneWay,
    legs: [{ origin: 'CPH', destination: 'SYD', date: '2026-10-22' }],
  }
  assert.equal(get(buildTripComUrl(unknown, opts), 'nonstoponly'), 'off')
})

/* ------------------------------------------------------------ tracking --- */

test('every link carries the affiliate identifiers', () => {
  for (const itinerary of [oneWay, roundTrip, multiCity]) {
    const url = buildTripComUrl(itinerary, opts)
    assert.equal(get(url, 'Allianceid'), '10501597')
    assert.equal(get(url, 'SID'), '330783916')
    assert.equal(get(url, 'trip_sub3'), 'D19756963')
  }
})

test('trip_sub1 is the placement, so two buttons are distinguishable in reporting', () => {
  const fromChat = buildTripComUrl(roundTrip, { ...opts, placement: 'concierge-chat' })
  const fromResults = buildTripComUrl(roundTrip, { ...opts, placement: 'flight-results' })
  assert.equal(get(fromChat, 'trip_sub1'), 'concierge-chat')
  assert.equal(get(fromResults, 'trip_sub1'), 'flight-results')
})

/* ------------------------------------------------------------ currency --- */

test('the site currencies pass through as they are', () => {
  for (const currency of ['EUR', 'USD', 'GBP', 'CHF', 'AED', 'DKK']) {
    assert.equal(get(buildTripComUrl(roundTrip, { ...opts, currency }), 'curr'), currency)
  }
})

test('an unsupported currency falls back to EUR rather than travelling as-is', () => {
  assert.equal(get(buildTripComUrl(roundTrip, { ...opts, currency: 'JPY' }), 'curr'), 'EUR')
  assert.equal(get(buildTripComUrl(roundTrip, { ...opts, currency: '' }), 'curr'), 'EUR')
  assert.equal(get(buildTripComUrl(roundTrip, { placement: 'trip-summary' }), 'curr'), 'EUR')
})

test('currency case does not matter', () => {
  assert.equal(get(buildTripComUrl(roundTrip, { ...opts, currency: 'dkk' }), 'curr'), 'DKK')
})

/* -------------------------------------------------------------- shape --- */

test('IATA codes are lowercased, whatever case they arrive in', () => {
  const url = buildTripComUrl(
    { ...oneWay, legs: [{ origin: 'CpH', destination: 'syd', date: '2026-10-22' }] },
    opts
  )
  assert.equal(get(url, 'dcity'), 'cph')
  assert.equal(get(url, 'acity'), 'syd')
})

test('the URL is the Trip.com search endpoint and nothing else', () => {
  const url = buildTripComUrl(roundTrip, opts)
  assert.ok(url.startsWith('https://www.trip.com/flights/showfarefirst?'))
})

test('a malformed itinerary throws rather than producing a link to nowhere', () => {
  assert.throws(() => buildTripComUrl({ ...oneWay, legs: [] }, opts), /no legs/)
  assert.throws(
    () =>
      buildTripComUrl(
        { ...oneWay, legs: [{ origin: 'Copenhagen', destination: 'SYD', date: '2026-10-22' }] },
        opts
      ),
    /IATA/
  )
  assert.throws(
    () =>
      buildTripComUrl(
        { ...oneWay, legs: [{ origin: 'CPH', destination: 'SYD', date: '22 October' }] },
        opts
      ),
    /YYYY-MM-DD/
  )
})
