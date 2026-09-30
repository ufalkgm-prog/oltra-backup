import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBookClick } from './bookClicks.ts'

/* The body comes from the browser, so only a known kind and well-formed ids
 * get through; anything else is dropped field by field, or whole. */

test('a hotel checkout click', () => {
  assert.deepEqual(parseBookClick({ kind: 'hotel_checkout', hotelId: 1318, source: 'concierge' }), {
    kind: 'hotel_checkout',
    hotelId: 1318,
    flightRoute: undefined,
    source: 'concierge',
  })
})

test('a flight click with a multi-city route', () => {
  assert.equal(parseBookClick({ kind: 'flight_tripcom', flightRoute: 'CPH-FCO / NAP-CPH' })?.flightRoute, 'CPH-FCO / NAP-CPH')
})

test('an unknown kind is dropped whole', () => {
  assert.equal(parseBookClick({ kind: 'booking_confirmed', hotelId: 1 }), null)
  assert.equal(parseBookClick(null), null)
})

test('malformed fields are dropped, the click kept', () => {
  assert.deepEqual(parseBookClick({ kind: 'hotel_external', hotelId: '1318', flightRoute: 'DROP TABLE', source: 'admin' }), {
    kind: 'hotel_external',
    hotelId: undefined,
    flightRoute: undefined,
    source: undefined,
  })
})
