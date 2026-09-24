import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flightPassengers } from './passengers.ts'

/* Under-2s fly as lap infants, one per adult; everyone else keeps their real
 * age (2026-09-24). */

test('a baby is a lap infant, an older child a child', () => {
  assert.deepEqual(flightPassengers(2, 2, ['0', '7']), { adults: 2, children: 1, infants: 1, childAges: [7] })
  assert.deepEqual(flightPassengers(2, 1, [1]), { adults: 2, children: 0, infants: 1, childAges: [] })
})

test('two is no longer an infant', () => {
  assert.deepEqual(flightPassengers(2, 1, ['2']), { adults: 2, children: 1, infants: 0, childAges: [2] })
})

test('one lap per adult; the next under-2 takes a seat', () => {
  assert.deepEqual(flightPassengers(1, 2, ['0', '1']), { adults: 1, children: 1, infants: 1, childAges: [1] })
})

test('missing ages fly as children', () => {
  assert.deepEqual(flightPassengers(2, 2, []), { adults: 2, children: 2, infants: 0, childAges: [] })
  assert.deepEqual(flightPassengers(2, 2, ['', '5']), { adults: 2, children: 2, infants: 0, childAges: [5] })
})

test('no children, and odd input', () => {
  assert.deepEqual(flightPassengers(2, 0, ['0']), { adults: 2, children: 0, infants: 0, childAges: [] })
  assert.deepEqual(flightPassengers(0, 1, ['0']), { adults: 1, children: 0, infants: 1, childAges: [] })
})
