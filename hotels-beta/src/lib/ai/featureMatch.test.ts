import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phraseAt } from './featureMatch.ts'

/* Features are matched as words in the descriptions (2026-09-30). As bare
 * substrings, "pool" found "whirlpool" and "spa" found "spacious". */

test('whole words and plurals match', () => {
  assert.equal(phraseAt('a heated pool and two spas', 'pool'), true)
  assert.equal(phraseAt('three pools above the sea', 'pool'), true)
  assert.equal(phraseAt('terraces over the lake', 'terrace'), true)
  assert.equal(phraseAt('villas with a private pool.', 'private pool'), true)
  assert.equal(phraseAt('a spa, a gym', 'spa'), true)
})

test('words that merely contain the phrase do not', () => {
  assert.equal(phraseAt('a whirlpool bath', 'pool'), false)
  assert.equal(phraseAt('an hour from liverpool', 'pool'), false)
  assert.equal(phraseAt('spacious suites', 'spa'), false)
  assert.equal(phraseAt('open space', 'spa'), false)
  assert.equal(phraseAt('a poolside bar', 'pool'), false)
})

test('a later occurrence is still found', () => {
  assert.equal(phraseAt('a whirlpool, and an outdoor pool', 'pool'), true)
})
