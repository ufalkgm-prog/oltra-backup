import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flightPriceBasis, flightPriceBasisShort, hotelPriceBasis } from './priceBasis.ts'

/* What each price covers, in one wording (2026-09-24). */

test('a hotel price names its rooms and nights, singular or plural by count', () => {
  assert.equal(hotelPriceBasis('2027-05-03', '2027-05-10', 2), '2 rooms – 7 nights')
  assert.equal(hotelPriceBasis('2027-05-03', '2027-05-04', 1), '1 room – 1 night')
  assert.equal(hotelPriceBasis('2027-05-03', '2027-05-04', 3), '3 rooms – 1 night')
  assert.equal(hotelPriceBasis('2027-05-03', '2027-05-06', 1), '1 room – 3 nights')
})

test('no dates: rooms only, and one room is assumed', () => {
  assert.equal(hotelPriceBasis('', '', null), '1 room')
})

test('a flight price counts every passenger, lap infants included', () => {
  assert.equal(flightPriceBasis({ adults: 2, children: 1, infants: 1 }, 'return'), 'Total · 4 passengers · return')
  assert.equal(flightPriceBasis({ adults: 1 }, 'one-way'), 'Total · 1 passenger · one-way')
})

test('the landing rows say pax, with no Total', () => {
  assert.equal(flightPriceBasisShort({ adults: 2, children: 1 }, 'return'), '3 pax · return')
  assert.equal(flightPriceBasisShort({ adults: 1 }, 'one-way'), '1 pax · one-way')
})
