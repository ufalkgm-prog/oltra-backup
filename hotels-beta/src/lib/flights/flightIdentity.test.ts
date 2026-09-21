import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeFlightNumbers, identifyItinerary } from './flightIdentity.ts'
import type { FlightLeg, Itinerary, Segment } from './itinerary.ts'

/* The block beside a Trip.com handoff has one job: let the member recognise
 * the itinerary in a list on someone else's site. These tests cover the part
 * with a rule in it - how a carrier and its flight numbers are grouped - and
 * that a leg's date and departure time come out of the data rather than out of
 * a model's sentence. */

function segment(airline: string, flightNumber: string, departIso: string): Segment {
  return {
    airline: { name: airline, iataCode: flightNumber.slice(0, 2), logoUrl: null },
    flightNumber,
    originCode: 'CPH',
    originName: 'Copenhagen',
    destinationCode: 'BKK',
    destinationName: 'Bangkok',
    departIso,
    arriveIso: departIso,
    departTime: departIso.slice(11, 16),
    arriveTime: departIso.slice(11, 16),
    durationMinutes: 600,
    aircraft: '',
    originTimezone: '',
    destinationTimezone: '',
    originTerminal: null,
    destinationTerminal: null,
    cabinClassMarketingName: '',
    baggages: [],
    amenities: null,
  }
}

function leg(originCode: string, destinationCode: string, segments: Segment[]): FlightLeg {
  return {
    id: `${originCode}${destinationCode}`,
    airline: segments[0]?.airline.name ?? '',
    airlines: [],
    longHaulAirline: null,
    flightNumber: segments[0]?.flightNumber ?? '',
    originCode,
    destinationCode,
    departTime: segments[0]?.departTime ?? '',
    arriveTime: '',
    durationMinutes: 600,
    stops: Math.max(0, segments.length - 1),
    stopSummary: '',
    layovers: [],
    segments,
    fareBrand: '',
    conditions: {
      refundable: null,
      changeable: null,
      advanceSeatSelection: null,
      priorityBoarding: null,
      priorityCheckIn: null,
    },
  }
}

function itinerary(slices: FlightLeg[]): Itinerary {
  return {
    id: 'it_1',
    offerId: 'off_1',
    slices,
    outbound: slices[0],
    inbound: slices[1],
    priceEur: 1200,
    currency: 'EUR',
    score: 0,
  }
}

test('one carrier flying both segments is named once', () => {
  const connection = leg('CPH', 'SYD', [
    segment('Thai Airways', 'TG951', '2026-10-22T13:45:00+02:00'),
    segment('Thai Airways', 'TG471', '2026-10-23T08:20:00+07:00'),
  ])
  assert.equal(describeFlightNumbers(connection), 'Thai Airways TG951, TG471')
})

test('a change of carrier names both', () => {
  const mixed = leg('CPH', 'SYD', [
    segment('Lufthansa', 'LH800', '2026-10-22T06:00:00+02:00'),
    segment('Swiss', 'LX123', '2026-10-22T10:00:00+02:00'),
  ])
  assert.equal(describeFlightNumbers(mixed), 'Lufthansa LH800 + Swiss LX123')
})

test('a carrier met twice on one leg is not flattened into one group', () => {
  /* A - B - A: grouping across the whole leg would print the two Thai flights
   * together and put them in an order the journey is not flown in. */
  const there = leg('CPH', 'SYD', [
    segment('Thai Airways', 'TG951', '2026-10-22T13:45:00+02:00'),
    segment('Bangkok Airways', 'PG915', '2026-10-23T09:00:00+07:00'),
    segment('Thai Airways', 'TG471', '2026-10-23T18:00:00+07:00'),
  ])
  assert.equal(
    describeFlightNumbers(there),
    'Thai Airways TG951 + Bangkok Airways PG915 + Thai Airways TG471'
  )
})

test('a direct flight is one carrier and one number', () => {
  const direct = leg('CPH', 'LHR', [segment('British Airways', 'BA811', '2026-11-12T07:10:00+01:00')])
  assert.equal(describeFlightNumbers(direct), 'British Airways BA811')
})

test('a return itinerary identifies both legs, in travel order', () => {
  const out = leg('CPH', 'SYD', [segment('Thai Airways', 'TG951', '2026-10-22T13:45:00+02:00')])
  const back = leg('SYD', 'CPH', [segment('Thai Airways', 'TG476', '2026-10-31T06:05:00+11:00')])
  const identity = identifyItinerary(itinerary([out, back]))

  assert.equal(identity.length, 2)
  assert.deepEqual(identity[0], {
    route: 'CPH → SYD',
    date: '22 Oct',
    departTime: '13:45',
    flights: 'Thai Airways TG951',
  })
  assert.deepEqual(identity[1], {
    route: 'SYD → CPH',
    date: '31 Oct',
    departTime: '06:05',
    flights: 'Thai Airways TG476',
  })
})

test('a multi-city itinerary identifies every leg', () => {
  const identity = identifyItinerary(
    itinerary([
      leg('CPH', 'SYD', [segment('Qantas', 'QF6', '2026-10-22T13:45:00+02:00')]),
      leg('SYD', 'CHC', [segment('Air New Zealand', 'NZ104', '2026-10-28T09:30:00+11:00')]),
      leg('CHC', 'CPH', [segment('Emirates', 'EK413', '2026-11-02T22:15:00+13:00')]),
    ])
  )
  assert.deepEqual(
    identity.map(entry => entry.route),
    ['CPH → SYD', 'SYD → CHC', 'CHC → CPH']
  )
  assert.deepEqual(
    identity.map(entry => entry.date),
    ['22 Oct', '28 Oct', '2 Nov']
  )
})

test('the date is the local departure date, not a UTC conversion of it', () => {
  /* 00:30 in Auckland on 2 November is still 1 November in UTC. Reading the
   * date off the ISO string keeps the day the member sees on their ticket. */
  const late = leg('AKL', 'SYD', [segment('Qantas', 'QF144', '2026-11-02T00:30:00+13:00')])
  assert.equal(identifyItinerary(itinerary([late]))[0].date, '2 Nov')
})

test('a leg with no segments still identifies its route rather than throwing', () => {
  const empty = identifyItinerary(itinerary([leg('CPH', 'SYD', [])]))
  assert.equal(empty[0].route, 'CPH → SYD')
  assert.equal(empty[0].date, '')
})
