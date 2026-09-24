import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseExtraction } from './extractParse.ts'

/* The extraction answers in two lines, or in its examples' one-line shape.
 * Read as two lines only, the one-line reply lost its request and a mixed
 * message was declined whole (2026-09-24). */

test('two lines, as instructed', () => {
  assert.deepEqual(parseExtraction('PROBE\nFind us a hotel in Milan in April.'), {
    removed: 'PROBE',
    request: 'Find us a hotel in Milan in April.',
  })
})

test('one line, as in the examples', () => {
  assert.deepEqual(parseExtraction('PROBE / Find us a hotel in Milan for Design Week in April.'), {
    removed: 'PROBE',
    request: 'Find us a hotel in Milan for Design Week in April.',
  })
  assert.deepEqual(parseExtraction('ACCOUNT / Find me flights to Rome in June.'), {
    removed: 'ACCOUNT',
    request: 'Find me flights to Rome in June.',
  })
})

test('an echoed example arrow is tolerated', () => {
  assert.deepEqual(parseExtraction('"…" -> PRIVACY / I\'d like a hotel in Rome.'), {
    removed: 'PRIVACY',
    request: "I'd like a hotel in Rome.",
  })
})

test('nothing left is NONE, still read', () => {
  assert.deepEqual(parseExtraction('PROBE / NONE'), { removed: 'PROBE', request: 'NONE' })
  assert.deepEqual(parseExtraction('PRIVACY\nNONE'), { removed: 'PRIVACY', request: 'NONE' })
})
