import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatReturnDeparture, reverseRoute } from './savedFlights.ts'

test('a saved route reads the other way for the flight home', () => {
  assert.equal(reverseRoute('CPH → London'), 'London → CPH')
  assert.equal(reverseRoute('CPH'), '')
  assert.equal(reverseRoute(null), '')
})

test('the return departure keeps the airport local time', () => {
  assert.equal(formatReturnDeparture('2026-11-08T10:20:00+00:00'), '08 Nov 2026 · 10:20')
  assert.equal(formatReturnDeparture('2026-11-08T23:55:00-05:00'), '08 Nov 2026 · 23:55')
  assert.equal(formatReturnDeparture('2026-11-08'), '08 Nov 2026')
  assert.equal(formatReturnDeparture(''), '')
})
