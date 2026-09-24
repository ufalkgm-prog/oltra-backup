import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flightPriceBasis, hotelPriceBasis } from './priceBasis.ts'

/* What each price covers, in one wording (2026-09-24). */

test('a hotel price names its nights and rooms', () => {
  assert.equal(hotelPriceBasis('2027-05-03', '2027-05-10', 2), 'Total · 7 nights · 2 rooms')
  assert.equal(hotelPriceBasis('2027-05-03', '2027-05-04', 1), 'Total · 1 night · 1 room')
})

test('no dates: the stay is still the total, and one room is assumed', () => {
  assert.equal(hotelPriceBasis('', '', null), 'Total stay · 1 room')
})

test('a flight price counts every passenger, lap infants included', () => {
  assert.equal(flightPriceBasis({ adults: 2, children: 1, infants: 1 }, 'return'), 'Total · 4 passengers · return')
  assert.equal(flightPriceBasis({ adults: 1 }, 'one-way'), 'Total · 1 passenger · one-way')
})
