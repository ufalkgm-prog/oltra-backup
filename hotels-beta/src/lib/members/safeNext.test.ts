import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeNext } from './safeNext.ts'

test('a same-site path is kept', () => {
  assert.equal(safeNext('/members/saved-trips'), '/members/saved-trips')
  assert.equal(safeNext('/hotels?city=Paris'), '/hotels?city=Paris')
})

test('anything that leaves the site falls back', () => {
  assert.equal(safeNext('https://example.com'), '/members')
  assert.equal(safeNext('//example.com'), '/members')
  assert.equal(safeNext('/\\example.com'), '/members')
  assert.equal(safeNext('javascript:alert(1)'), '/members')
  assert.equal(safeNext(null), '/members')
  assert.equal(safeNext(''), '/members')
})
